const rpc = require('../../index')
const Promise = require('bluebird')
const sinon = require('sinon')

const config = {
  connection: {},
  send: {serviceName: 'send-recv-test-service', replyTimeout: 30000, autoDelete: true}, // exchange config
  recv: {serviceName: 'send-recv-test-service', noBatch: true, autoDelete: true} // queue config
}

describe('integration send-recv', () => {
  let someAction
  let errorAction
  before(() => {
    someAction = sinon.stub()

    errorAction = sinon.stub()
    errorAction.onCall(0).throws(new Error('Error 1'))
    errorAction.onCall(1).throws(new Error('Error 2'))
    errorAction.onCall(2).returns(42)

    rpc.receive('v1.send-recv-test-service.someAction', someAction)
    rpc.receive('v1.send-recv-test-service.errorAction', errorAction)

    return rpc.initialize(config)
  })
  after(() => Promise.delay(100).then(() => rpc.shutdown()))

  it('should handle', () => {
    return rpc.send('v1.send-recv-test-service.someAction', {a: 10, b: 5})
    .then(() => Promise.delay(50))
    .then(() => {
      expect(someAction).to.have.been.called
      expect(someAction).to.have.been.calledWithMatch({a: 10, b: 5}, {}, 'v1.send-recv-test-service.someAction')
    })
  })

  it('should nack message on error', () => {
    expect(errorAction).to.have.not.been.called
    return rpc.send('v1.send-recv-test-service.errorAction', {a: 20, b: 30})
    .then(() => Promise.delay(50))
    .then(() => {
      expect(errorAction).to.have.been.calledThrice
      expect(errorAction.firstCall).to.have.been.calledWithMatch({a: 20, b: 30}, {}, 'v1.send-recv-test-service.errorAction')
      expect(errorAction.secondCall).to.have.been.calledWithMatch({a: 20, b: 30}, {}, 'v1.send-recv-test-service.errorAction')
      expect(errorAction.thirdCall).to.have.been.calledWithMatch({a: 20, b: 30}, {}, 'v1.send-recv-test-service.errorAction')
    })
  })
})
