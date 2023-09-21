# gRPC x Moleculer

Receive and send gRPC traffic from code written with the Moleculer framework. This can be helpful
for migrating away from the piecemeal communication protocol Moleculer uses.

> [!IMPORTANT]  
> This code isn't maintained/heavily supported. It was written to solve problems with a particular
> deployment of Moleculer so it brings plenty of opinions. Though I'm happy to help with specific
> issues, I figure organizations running into issues this would solve have the engineering people to
> run with what's available here. 🙂

## How to

This project provides examples for both:

- Server: Receive requests to Moleculer actions through gRPC
- Client: Send requests through gRPC

Since, being a framework + having a loose API, there are lots of ways to implement Moleculer a npm
package isn't available. The code here assumes a particular response format and gRPC services
exposed through Kubernetes services going through linkerd. I haven't spent the time to propagate
tracing details.

That said, there are [mixins](https://moleculer.services/docs/0.14/services.html#Mixins) covering
[JSON serialized](https://moleculer.services/docs/0.14/networking.html#Serialization) payloads.

```js
const { ServiceBroker } = require('moleculer');
const { startGrpcServer, GrpcClientMixin } = require('@org/moleculer-grpc-bridge');

const broker = new ServiceBroker();

broker.createService({
  name: 'scheduler',

  mixins: [
    // Requests leaving `scheduler` which pass the `shouldCallThroughGrpc` predicate
    // will be sent to a gRPC service.
    new GrpcClientMixin(broker, {
      shouldCallThroughGrpc: async (name, params, opts) => {
        // - Look at an environment variable
        // - Load a configuration
        // - whatever works!
        return true;
      },
    }),
  ],
  async started() {
    await startGrpcServer(this.actions);
  },
  actions: {
    // ...
  },
});
```

## Tests

Tested against:

- Node v18
- Moleculer v0.14.22
- gRPC JS v1.8 over HTTP/2 via linkerd 2.13

Probably works / minimums:

- Node v16+
- Moleculer v0.12.0+
- gRPC v1
