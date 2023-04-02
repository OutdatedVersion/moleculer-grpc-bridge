# gRPC x Moleculer

Receive and send gRPC traffic from a service written with the Moleculer framework.

- Type safe
- Decent test suite
- Both modular and opinionated pieces

## How to

This package provides [mixins](https://moleculer.services/docs/0.14/services.html#Mixins) for both client and server.

```js
const { ServiceBroker } = require("moleculer");
const { GrpcServerMixin, GrpcClientMixin } = require("moleculer-grpc");

const broker = new ServiceBroker();

broker.createService({
  name: "fleet",
  mixins: [new GrpcServerMixin(broker), new GrpcClientMixin(broker)],
});
```

```js
const { ServiceBroker } = require("moleculer");
const { createGenericClient } = require("moleculer-grpc");

const broker = new ServiceBroker();

broker.createService({
  name: "fleet",
  actions: {
    hello: (ctx) => {
      ctx.call("");
      const client = createGenericClient(ctx.call);
    },
  },
});
```

## Installation

```shell
npm install moleculer-grpc
```

Tested against:

- Node v18
- Moleculer v0.14.22
- gRPC v00

Probably works / minimums:

- Node v16+
- Moleculer v0.12.0+
- gRPC

## Support

Please open an issue if you're running into something
not covered elsewhere.
