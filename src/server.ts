import { promisify } from 'util';
import {
  Metadata,
  ServerUnaryCall,
  ServiceDefinition,
  UntypedServiceImplementation,
  sendUnaryData,
  status as GrpcCode,
  Server,
  ServerCredentials,
} from '@grpc/grpc-js';
import { Errors, LoggerInstance, Service, ServiceActions, ServiceBroker } from 'moleculer';
import { deserialize, serialize } from './common';

// See https://grpc.github.io/grpc/core/md_doc_statuscodes.html
// See https://moleculer.services/docs/0.14/errors.html#Internal-error-classes
export const moleculerErrorToGrpcCode = (error: Errors.MoleculerError): GrpcCode | undefined => {
  switch (error.name) {
    case 'ServiceNotFoundError':
      // I think this would make sense as unavailable too?
      return GrpcCode.UNIMPLEMENTED;
    case 'ServiceNotAvailableError':
      return GrpcCode.UNAVAILABLE;
    case 'RequestTimeoutError':
      // This leaves the system in an undefined state.
      // It's possible the request did complete successfully but the
      // response didn't get back in time (i.e. dropped by transport). Like in gRPC.
      return GrpcCode.DEADLINE_EXCEEDED;
    case 'RequestSkippedError':
      // This leaves the system in an undefined state.
      return GrpcCode.DEADLINE_EXCEEDED;
    case 'RequestRejectedError':
      return GrpcCode.UNAVAILABLE;
    case 'QueueIsFullError':
      return GrpcCode.UNAVAILABLE;
    case 'MaxCallLevelError':
      // This leaves the system in an undefined state.
      return GrpcCode.INTERNAL;
    // Other built-in errors are not in the request path
  }
};

const createGrpcService = (
  actions: ServiceActions,
  { logger }: { logger?: LoggerInstance } = {}
): { service: ServiceDefinition; impl: UntypedServiceImplementation } => {
  const service: ServiceDefinition = {};
  const impl: UntypedServiceImplementation = {};
  for (const k of Object.keys(actions)) {
    // @ts-ignore it's ok we're abusing this api
    service[k] = {
      path: `/${k}`,
      requestStream: false,
      responseStream: false,
      requestSerialize: serialize,
      requestDeserialize: deserialize,
      responseSerialize: serialize,
      responseDeserialize: deserialize,
    };

    impl[k] = async (
      call: ServerUnaryCall</* request */ any, /* response */ any>,
      callback: sendUnaryData</* response */ any>
    ) => {
      logger?.debug(`[${k}] gRPC request`, call.request);

      try {
        const grpcMeta = call.metadata.getMap();
        logger?.debug(`[${k}] gRPC meta`, grpcMeta);

        // note: moleculer intercepts calls to fn and creates a context
        const res = await actions[k](call.request, {
          meta: { token: grpcMeta.token, requestStartTime: Date.now() },
        });
        callback(null, res);
        logger?.debug(`[${k}] sent back positive response`, res);
      } catch (error: any) {
        const grpcMeta = new Metadata();

        grpcMeta.set(
          'moleculer.error',
          JSON.stringify({
            name: error.name,
            message: error.message,
            data: error.data,
            retryable: error.retryable,
            internalError: {
              name: error.internalError?.name,
              message: error.internalError?.message,
              data: error.internalError?.data,
              retryable: error.internalError?.retryable,
            },
          })
        );

        grpcMeta.setOptions({ idempotentRequest: error.retryable ?? false });

        // soft expectation: custom errors should set a code
        // this means any error with a gRPC code (builtins go to ~16) is left alone
        // and anything currently reporting a HTTP code is translated.
        // this **does not** account for namespaced errors.
        if (error.code > 20) {
          // TODO: We should set some metadata to illustrate some of these statuses
          const grpcCode = moleculerErrorToGrpcCode(error);
          if (!grpcCode) {
            logger?.warn(`[${k}] could not map '${error.name}' to gRPC status`);
          }

          error.code = grpcCode ?? GrpcCode.UNKNOWN;
        }

        // `details` is a succinct description of the error
        error.details = error.message;
        error.metadata = grpcMeta; // serialized by library

        callback(error, null);
        logger?.debug(`[${k}] sent back negative response`, error);
      }
    };
  }
  return {
    service, // the "schema"
    impl, // the implementation
  };
};

export const startGrpcServer = async (
  actions: ServiceActions,
  opts: { port?: number; logger?: LoggerInstance }
): Promise<Server> => {
  const { service, impl } = createGrpcService(actions, opts);

  const grpcServer = new Server();
  grpcServer.addService(service, impl);
  const port = await promisify(grpcServer.bindAsync).bind(grpcServer)(
    `0.0.0.0:${opts.port}`,
    ServerCredentials.createInsecure()
  );
  grpcServer.start();
  // `port` will != `opts.port` when set to an just-in-time port like `0`
  opts.logger?.info(`Started gRPC server on :${port}`);
  opts.logger?.info(`Server listening for ${Object.keys(service).join(', ')}`);
  return grpcServer;
};
