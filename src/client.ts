import { performance } from 'perf_hooks';
import { promisify } from 'util';
import { ChannelCredentials, Metadata, makeGenericClientConstructor } from '@grpc/grpc-js';
import { CallingOptions, Context, LoggerInstance, Service, ServiceBroker } from 'moleculer';
import { deserialize, serialize } from './common';

const createGrpcClient = (serviceName: string, actions: string[]) => {
  return makeGenericClientConstructor(
    actions.reduce(
      (prev, action) => ({
        ...prev,
        [action]: {
          path: `/${action}`,
          requestStream: false,
          responseStream: false,
          requestSerialize: serialize,
          requestDeserialize: deserialize,
          responseSerialize: serialize,
          responseDeserialize: deserialize,
        },
      }),
      {}
    ),
    serviceName
  );
};

export interface GrpcClientMixinConfig {
  logger?: LoggerInstance;

  shouldCallThroughGrpc: <TParams = unknown, TOpts = CallingOptions>(
    name: string,
    params: TParams,
    opts?: TOpts
  ) => Promise<boolean> | boolean;
}

export class GrpcClientMixin extends Service {
  public override name = 'grpcClient';

  public constructor(broker: ServiceBroker, private readonly config: GrpcClientMixinConfig) {
    super(broker);
    this.parseServiceSchema({
      name: this.name,
      hooks: this.hooks,
    });
  }

  public hooks = {
    before: {
      '*': (ctx: Context<unknown>): void => {
        const originalCall = ctx.call;

        const that = this;
        const logger = that.config.logger;
        ctx.call = async function grpcWillingCall<T, P>(
          actionName: string,
          params?: P,
          opts?: CallingOptions
        ): Promise<T> {
          const isAllowed = await that.config.shouldCallThroughGrpc.call(
            that,
            actionName,
            params,
            opts
          );

          if (!isAllowed) {
            logger?.debug(`'${actionName}' going through moleculer: not on client allowlist`);
            return originalCall.call(this, actionName, params, opts) as Promise<T>;
          }

          const [version, service, action] = actionName.split('.');
          const host = `${service}-${version}:5000`;

          logger?.debug(`'${actionName}' going through gRPC via '${host}': on client allowlist`);
          const startCreateClient = performance.now();
          const client = new (createGrpcClient(service, [action]))(
            host,
            ChannelCredentials.createInsecure()
          );
          const actionFn = promisify(client[action]).bind(client);
          const createClientTime = (performance.now() - startCreateClient).toFixed(2);
          logger?.debug(`'${actionName}' client took took ${createClientTime}ms to build`);

          const meta = new Metadata();
          if (opts?.meta?.token) {
            meta.set('access_token', opts.meta.token);
          }
          if (opts?.requestID) {
            meta.set('request_id', opts.requestID);
          }
          if (opts?.caller) {
            meta.set('moleculer.caller_node_id', that.broker.nodeID);
          }

          try {
            const startCall = performance.now();
            const res = await actionFn(params, meta);
            const callTime = (performance.now() - startCall).toFixed(2);
            logger?.debug(
              `'${actionName}' received positive response from '${host}' in ${callTime}ms`,
              res
            );
            return res as T;
          } catch (error) {
            logger?.debug(`'${actionName}' received negative response from '${host}'`, error);
            throw error;
          }
        };
      },
    },
  };
}
