const Promise = require('bluebird')
const rabbot = require('rabbot')
const transformConfig = require('./lib/transformConfig')
const errors = require('./lib/errors')

const request = require('./lib/request')
const respond = require('./lib/respond')

const send = require('./lib/send')
const receive = require('./lib/receive')

const publish = require('./lib/pub')
const subscribe = require('./lib/sub')

const RabRPC = {
  configure (config, transform = true) {
    const rabbotConfig = transform ? transformConfig(config) : config
    return Promise.resolve(rabbot.configure(rabbotConfig))
    .tap(() => { this.initialized = true })
    .catch(error => {
      this.initialized = false
      if (typeof error === 'string') {
        throw new errors.RabRPCError(error)
      } else {
        throw error
      }
    })
  },
  closeAll (reset) {
    return Promise.resolve(this.initialized ? rabbot.closeAll(reset) : undefined)
  },
  shutdown () {
    return Promise.resolve(this.initialized ? rabbot.shutdown() : undefined)
  },
  request,
  respond,
  send,
  receive,
  publish,
  subscribe
}

module.exports = RabRPC
module.exports.errors = errors
