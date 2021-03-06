# RabRPC

[![NPM version][npm-image]][npm-url]
[![Build status][ci-image]][ci-url]
[![Dependency Status][daviddm-image]][daviddm-url]
[![Coverage Status][coverage-image]][coverage-url]
[![Code Climate][codeclimate-image]][codeclimate-url]
[![Known Vulnerabilities][snyk-image]][snyk-url]

> ## Long story short
> If you control your app lifecycle, better use [amqplib](https://www.npmjs.com/package/amqplib). And don't use queue message broker for pubslish/subscribe.

Yet another opinionated RPC library based on [RabbitMQ](http://www.rabbitmq.com/) (through [rabbot](https://github.com/arobson/rabbot))

## Features

* Promise-based interface (thanks [rabbot](https://github.com/arobson/rabbot))
* Convention over configuration in exchange, queue, routingKeys naming

Implemented producer/consumer patterns:

* [x] Request / Response
* [x] Publish / Subscribe
* [x] Send / Receive

## Installation

```bash
npm install --save rabrpc
# or
yarn add rabrpc
```

## Examples

### Initialization

> Important! `rpc.configure` _should_ be called **after** binding handlers via `rpc.respond` in consumer microservice and _must_ be called **before** requesting data with `rpc.request` in provider microservice

##### rpc.configure(config, [transformConfig = true])

* `config` - rabrpc or rabbot config object
* `transformConfig` - if `config` is a rabbot setting `transformConfig` must be false, default true

###### rabbot json configuration

If you need more flexibility, you can pass a valid rabbot configuration into `rpc.configure`
The only requirement is name exchanges, queues and bindings with [convention](#convention)

```javascript
const config = {
  connection: {
    user: 'guest',
    pass: 'guest',
    server: '127.0.0.1',
    // server: "127.0.0.1, 194.66.82.11",
    // server: ["127.0.0.1", "194.66.82.11"],
    port: 5672,
    timeout: 2000,
    vhost: '%2fmyhost'
  },
  exchanges: [
    { name: 'config-ex.1', type: 'fanout', publishTimeout: 1000 },
    {
      name: 'config-ex.2',
      type: 'topic',
      alternate: 'alternate-ex.2',
      persistent: true
    },
    { name: 'dead-letter-ex.2', type: 'fanout' }
  ],
  queues: [
    { name: 'config-q.1', limit: 100, queueLimit: 1000 },
    { name: 'config-q.2', subscribe: true, deadLetter: 'dead-letter-ex.2' }
  ],
  bindings: [
    { exchange: 'config-ex.1', target: 'config-q.1', keys: ['bob', 'fred'] },
    { exchange: 'config-ex.2', target: 'config-q.2', keys: 'test1' }
  ]
}

rpc.configure(config, false) // transform config = false
```

### Request / Response

#### Responder initialization

```javascript
const rpc = require('rabrpc') // singleton

const config = {
  // uri
  connection: 'amqp://guest:guest@localhost:5672/?heartbeat=10',
  // or object passed to rabbot see https://github.com/arobson/rabbot#configuration-via-json
  // connection: {user: 'guest', pass: 'guest', server: 'localhost', ...}

  // respond configuration in consumer microservice
  // this config will create exchange(s), queue(s) and binding(s)
  // request configation in provider microservice only create exchange(s)

  res: {
    // string or object or array of strings or objects
    serviceName: 'foo-service-name',
    // rabbot queue options, see https://github.com/arobson/rabbot#addqueue-queuename-options-connectionname-
    // subscribe: true is default
    messageTtl: 30000,
    limit: 10
    // ...etc
  }
}

// somewhere in your microservice initialization cycle
rpc.configure(config) // returns promise
```

#### Requester initialization

```javascript
const rpc = require('rabrpc') // singleton

const config = {
  connection: '<URI string>', // see above

  // requesting resource configuration
  // this config will create only exchange(s)
  // respond configuration in consumer microservice will create queue(s) and binding(s)

  // req: 'foo-service-name' | ['foo-service-name', 'bar-service-name'] | {serviceName: 'foo-service-name'} | [{serviceName: 'foo-service-name'}, {serviceName: 'bar-service-name'}]
  req: 'foo-service-name'
}

// somewhere in your microservice initialization cycle
rpc.configure(config) // returns promise
```

#### Convention

| Parmeter        | Value                            | Example                        |
| --------------- | -------------------------------- | ------------------------------ |
| **exchange**    | req-res.`serviceName`            | req-res.foo-service-name       |
| **queue**       | req-res.`serviceName`            | req-res.foo-service-name       |
| **routingKey**  | `serviceName`                    | foo-service-name               |
| **messageType** | `version`.`serviceName`.`action` | v1.foo-service-name.someAction |

#### Response

##### rpc.respond(messageType, handler, [raw = false])

* `messageType` - full path for service action, e.g. `'v1.images.resize'` or `'v1.users.role.findAll'` where **second** part (`images`, `users`) is a serviceName specified in config (in rabbot using as type of message)
* `handler` - function, which takes `payload` or `message`, `responseActions` and `messageType`
  * `payload` or `message` - `message` if `raw` is `true` otherwise `message.body`
  * `responseActions` - object with 3 functions `success`, `fail`, `error`
  * `messageType` - type of rabbot message (usefull when listening for types, which contain `*` or `#`)
* `raw` - if `true` then first argument for `handler` will be rabbot `message` instead `message.body` by default

###### Example

```javascript
const rpc = require('rabrpc')

// before initialization
rpc.respond('v1.foo-service-name.someAction', (payload, actions, messageType) =>
  actions.success(payload * 2)
)

// handler can aslo just return promise, or `.then`able or value and result will be replied with success status
// exception or rejected promise will cause replying error (be sure throw `Error` with message)

rpc.respond('v1.foo-service-name.anotherAction', payload =>
  SomeDB.query({
    /* ... */
  }).then(rows => ({ count: rows.count, data: rows }))
)
rpc.respond('v1.foo-service-name.thirdAction', payload => payload * 2)

rpc.respond(
  'v1.foo-service-name.someResource.*',
  (payload, actions, messageType) => {
    const [version, serviceName, resource, actionName] = messageType.split('.')
    switch (actionName) {
      case 'find':
        return Resource.findAll(paylaod)
      case 'create':
        return Resource.create(payload)
      case 'destroy':
        return Resource.destroy(payload)
      default:
        throw new Error(`Action '${actionName}' is not supported!`)
    }
  }
)

// in your service initialization cycle
rpc.configure(config)
```

##### Request

###### rpc.request(messageType, payload, [options], [raw = false])

* `messageType` - see `rpc.respond` _messageType_ argument
* `payload` - payload data, which will passed into respond handler (see [supported payload](#supported-payload))
* `options` - rabbot request options (will be merged with defaults: `{replyTimeout: 10000}`)
* `raw` - resolve rabbot reply `message` instead of `message.body`

returns `Promise`, which resolved with `body` (or `message` if `raw` is `true`)

* `body` or `message`

###### Example

```javascript
const rpc = require('rabrpc')

// request allowed only after initialization
rpc
  .configure(config)
  .then(() => rpc.request('v1.foo-service-name.someAction', 42))
  .then(body => {
    console.log('response:', body.data) // body = {status: 'succes', data: 84}
  })
```

### Publish / Subscribe

#### Subscriber initialization

```javascript
const rpc = require('rabrpc') // singleton

const config = {
  connection: 'amqp://guest:guest@localhost:5672/?heartbeat=10',
  sub: {
    // string or object or array of strings or objects
    serviceName: 'foo-service-name',
    limit: 10
    // ...etc
  }
}

// somewhere in your microservice initialization cycle
rpc.configure(config) // returns promise
```

#### Publisher initialization

```javascript
const rpc = require('rabrpc') // singleton

const config = {
  connection: '<URI string>', // see above
  // pub: 'foo-service-name' | ['foo-service-name', 'bar-service-name'] | {serviceName: 'foo-service-name'} | [{serviceName: 'foo-service-name'}, {serviceName: 'bar-service-name'}]
  pub: 'foo-service-name'
}

// somewhere in your microservice initialization cycle
rpc.configure(config) // returns promise
```

#### Convention

| Parmeter        | Value                            | Example                                                       |
| --------------- | -------------------------------- | ------------------------------------------------------------- |
| **exchange**    | pub-sub.`serviceName`            | pub-sub.foo-service-name                                      |
| **queue**       | pub-sub.`serviceName`.uuid4      | pub-sub.foo-service-name.110ec58a-a0f2-4ac4-8393-c866d813b8d1 |
| **routingKey**  | `serviceName`                    | foo-service-name                                              |
| **messageType** | `version`.`serviceName`.`action` | v1.foo-service-name.someAction                                |

##### Subscribe

###### rpc.subscribe(messageType, handler, [raw = false])

* `messageType` - full path for service action, e.g. `'v1.images.archive'` or `'v1.statistics.synchronize'` where **second** part (`images`, `statistics`) is a serviceName specified in config (in rabbot using as type of message)
* `handler` - function, which takes `payload` or `message`, `actions` and `messageType`
  * `payload` or `message` - `message` if `raw` is `true` otherwise `message.body`
  * `messageType` - type of rabbot message (usefull when listening for types, which contain `*` or `#`)
* `raw` - if `true` then first argument for `handler` will be rabbot `message` instead `message.body` by default

###### Example

```javascript
const rpc = require('rabrpc')

// before initialization
rpc.subscribe(
  'v1.foo-service-name.someAction',
  (payload, actions, messageType) => {}
)

// always auto ack

// in your service initialization cycle
rpc.configure(config)
```

##### Publish

###### rpc.publish(messageType, payload, [options])

* `messageType` - see `rpc.respond` _messageType_ argument
* `payload` - payload data, which will passed into respond handler (see [supported payload](#supported-payload))
* `options` - rabbot publish options (will be merged with defaults: `{replyTimeout: 10000}`)

returns rabbot publish `Promise` (see [Rabbot Publish](https://github.com/arobson/rabbot#publish))

###### Example

```javascript
const rpc = require('rabrpc')

// publish allowed only after initialization
rpc
  .configure(config)
  .then(() => rpc.publish('v1.foo-service-name.someAction', 42))
  .then(() => {
    console.log('Message published')
  })
```

### Send / Receive

#### Receiver initialization

```javascript
const rpc = require('rabrpc') // singleton

const config = {
  connection: 'amqp://guest:guest@localhost:5672/?heartbeat=10',
  recv: {
    // string or object or array of strings or objects
    serviceName: 'foo-service-name',
    messageTtl: 30000,
    limit: 10
    // ...etc
  }
}

// somewhere in your microservice initialization cycle
rpc.configure(config) // returns promise
```

#### Sender initialization

```javascript
const rpc = require('rabrpc') // singleton

const config = {
  connection: '<URI string>', // see above
  // send: 'foo-service-name' | ['foo-service-name', 'bar-service-name'] | {serviceName: 'foo-service-name'} | [{serviceName: 'foo-service-name'}, {serviceName: 'bar-service-name'}]
  send: 'foo-service-name'
}

// somewhere in your microservice initialization cycle
rpc.configure(config) // returns promise
```

#### Convention

| Parmeter        | Value                            | Example                        |
| --------------- | -------------------------------- | ------------------------------ |
| **exchange**    | send-recv.`serviceName`          | send-recv.foo-service-name     |
| **queue**       | send-recv.`serviceName`          | send-recv.foo-service-name     |
| **routingKey**  | `serviceName`                    | foo-service-name               |
| **messageType** | `version`.`serviceName`.`action` | v1.foo-service-name.someAction |

##### Receive

###### rpc.receive(messageType, handler, [raw = false])

* `messageType` - full path for service action, e.g. `'v1.images.archive'` or `'v1.statistics.synchronize'` where **second** part (`images`, `statistics`) is a serviceName specified in config (in rabbot using as type of message)
* `handler` - function, which takes `payload`, `actions` and `messageType`
  * `payload` or `message` - `message` if `raw` is `true` otherwise `message.body`
  * `actions` - object with 3 functions `ack`, `nack`, `reject` (see [Rabbot Message API](https://github.com/arobson/rabbot#message-api))
  * `messageType` - type of rabbot message (usefull when listening for types, which contain `*` or `#`)
* `raw` - if `true` then first argument for `handler` will be rabbot `message` instead `message.body` by default

###### Example

```javascript
const rpc = require('rabrpc')

// before initialization
rpc.receive('v1.foo-service-name.someAction', (payload, actions, messageType) =>
  actions.ack()
)

// handler can aslo just return promise, or `.then`able or value and message will be ack'ed on promise resolution
// exception or rejected promise will cause nack'ing message

rpc.receive('v1.foo-service-name.anotherAction', payload =>
  SomeDB.query({
    /* ... */
  })
) // auto ack

rpc.receive(
  'v1.foo-service-name.someResource.*',
  (payload, actions, messageType) => {
    // you can manually ack message if you don't need default behaviuor
    actions.ack() // DO NOT RETURNS PROMISE
    const [version, serviceName, resource, actionName] = messageType.split('.')
    switch (actionName) {
      case 'find':
        return Resource.findAll(paylaod)
      case 'create':
        return Resource.create(payload)
      case 'destroy':
        return Resource.destroy(payload)
      default:
        throw new Error(`Action '${actionName}' is not supported!`) // will not produce nack call
    }
  }
)

// in your service initialization cycle
rpc.configure(config)
```

##### Send

###### rpc.send(messageType, payload, [options])

* `messageType` - see `rpc.respond` _messageType_ argument
* `payload` - payload data, which will passed into respond handler (see [supported payload](#supported-payload))
* `options` - rabbot publish options (will be merged with defaults: `{replyTimeout: 10000}`)

returns rabbot publish `Promise` (see [Rabbot Publish](https://github.com/arobson/rabbot#publish))

###### Example

```javascript
const rpc = require('rabrpc')

// send allowed only after initialization
rpc
  .configure(config)
  .then(() => rpc.send('v1.foo-service-name.someAction', 42))
  .then(() => {
    console.log('Message sended')
  })
```

### Graceful shutdown

###### rpc.stopSubscription()

remove all handlers, unsubscribe from queues

### Supported payload

* `string`
* `number`
* `null`
* JSON serializable `Object`
* `Buffer`

[npm-image]: https://img.shields.io/npm/v/rabrpc.svg?style=flat-square
[npm-url]: https://npmjs.org/package/rabrpc
[ci-image]: https://img.shields.io/travis/swarthy/rabrpc/master.svg?style=flat-square
[ci-url]: https://travis-ci.org/swarthy/rabrpc
[daviddm-image]: http://img.shields.io/david/swarthy/rabrpc.svg?style=flat-square
[daviddm-url]: https://david-dm.org/swarthy/rabrpc
[codeclimate-image]: https://img.shields.io/codeclimate/github/swarthy/rabrpc.svg?style=flat-square
[codeclimate-url]: https://codeclimate.com/github/swarthy/rabrpc
[snyk-image]: https://snyk.io/test/npm/rabrpc/badge.svg
[snyk-url]: https://snyk.io/test/npm/rabrpc
[coverage-image]: https://coveralls.io/repos/github/swarthy/rabrpc/badge.svg?branch=master
[coverage-url]: https://coveralls.io/r/swarthy/rabrpc?branch=master
