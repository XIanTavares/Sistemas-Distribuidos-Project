'use strict';

const { kForOnEventAttribute, kListener } = require('./constants');

const kCode = Symbol('kCode');
const kData = Symbol('kData');
const kError = Symbol('kError');
const kMessage = Symbol('kMessage');
const kReason = Symbol('kReason');
const kTarget = Symbol('kTarget');
const kType = Symbol('kType');
const kWasClean = Symbol('kWasClean');

/**
 * Classe que representa um evento.
 */
class Event {
  /**
   * Cria um novo `Event`.
   *
   * @param {String} type O nome do evento
   * @throws {TypeError} Se o argumento `type` não for especificado
   */
  constructor(type) {
    this[kTarget] = null;
    this[kType] = type;
  }

  /**
   * @type {*}
   */
  get target() {
    return this[kTarget];
  }

  /**
   * @type {String}
   */
  get type() {
    return this[kType];
  }
}

Object.defineProperty(Event.prototype, 'target', { enumerable: true });
Object.defineProperty(Event.prototype, 'type', { enumerable: true });

/**
 * Classe que representa um evento de fechamento.
 *
 * @extends Event
 */
class CloseEvent extends Event {
  /**
   * Cria um novo `CloseEvent`.
   *
   * @param {String} type O nome do evento
   * @param {Object} [options] Um objeto de dicionário que permite definir
   *     atributos via membros do objeto com o mesmo nome
   * @param {Number} [options.code=0] O código de status explicando por que a
   *     conexão foi fechada
   * @param {String} [options.reason=''] Uma string legível explicando por que
   *     a conexão foi fechada
   * @param {Boolean} [options.wasClean=false] Indica se a conexão foi fechada
   *     de forma limpa ou não
   */
  constructor(type, options = {}) {
    super(type);

    this[kCode] = options.code === undefined ? 0 : options.code;
    this[kReason] = options.reason === undefined ? '' : options.reason;
    this[kWasClean] = options.wasClean === undefined ? false : options.wasClean;
  }

  /**
   * @type {Number}
   */
  get code() {
    return this[kCode];
  }

  /**
   * @type {String}
   */
  get reason() {
    return this[kReason];
  }

  /**
   * @type {Boolean}
   */
  get wasClean() {
    return this[kWasClean];
  }
}

Object.defineProperty(CloseEvent.prototype, 'code', { enumerable: true });
Object.defineProperty(CloseEvent.prototype, 'reason', { enumerable: true });
Object.defineProperty(CloseEvent.prototype, 'wasClean', { enumerable: true });

/**
 * Classe que representa um evento de erro.
 *
 * @extends Event
 */
class ErrorEvent extends Event {
  /**
   * Cria um novo `ErrorEvent`.
   *
   * @param {String} type O nome do evento
   * @param {Object} [options] Um objeto de dicionário que permite definir
   *     atributos via membros do objeto com o mesmo nome
   * @param {*} [options.error=null] O erro que gerou este evento
   * @param {String} [options.message=''] A mensagem de erro
   */
  constructor(type, options = {}) {
    super(type);

    this[kError] = options.error === undefined ? null : options.error;
    this[kMessage] = options.message === undefined ? '' : options.message;
  }

  /**
   * @type {*}
   */
  get error() {
    return this[kError];
  }

  /**
   * @type {String}
   */
  get message() {
    return this[kMessage];
  }
}

Object.defineProperty(ErrorEvent.prototype, 'error', { enumerable: true });
Object.defineProperty(ErrorEvent.prototype, 'message', { enumerable: true });

/**
 * Classe que representa um evento de mensagem.
 *
 * @extends Event
 */
class MessageEvent extends Event {
  /**
   * Cria um novo `MessageEvent`.
   *
   * @param {String} type O nome do evento
   * @param {Object} [options] Um objeto de dicionário que permite definir
   *     atributos via membros do objeto com o mesmo nome
   * @param {*} [options.data=null] O conteúdo da mensagem
   */
  constructor(type, options = {}) {
    super(type);

    this[kData] = options.data === undefined ? null : options.data;
  }

  /**
   * @type {*}
   */
  get data() {
    return this[kData];
  }
}

Object.defineProperty(MessageEvent.prototype, 'data', { enumerable: true });

/**
 * Fornece métodos para emular a interface `EventTarget`. Não deve ser
 * usado diretamente.
 *
 * @mixin
 */
const EventTarget = {
  /**
   * Registra um ouvinte de evento.
   *
   * @param {String} type Uma string representando o tipo de evento para ouvir
   * @param {(Function|Object)} handler O ouvinte a ser adicionado
   * @param {Object} [options] Um objeto de opções que especifica características
   *     sobre o ouvinte de evento
   * @param {Boolean} [options.once=false] Um `Boolean` indicando que o
   *     ouvinte deve ser invocado no máximo uma vez após ser adicionado. Se `true`,
   *     o ouvinte será removido automaticamente quando invocado.
   * @public
   */
  addEventListener(type, handler, options = {}) {
    for (const listener of this.listeners(type)) {
      if (
        !options[kForOnEventAttribute] &&
        listener[kListener] === handler &&
        !listener[kForOnEventAttribute]
      ) {
        return;
      }
    }

    let wrapper;

    if (type === 'message') {
      wrapper = function onMessage(data, isBinary) {
        const event = new MessageEvent('message', {
          data: isBinary ? data : data.toString()
        });

        event[kTarget] = this;
        callListener(handler, this, event);
      };
    } else if (type === 'close') {
      wrapper = function onClose(code, message) {
        const event = new CloseEvent('close', {
          code,
          reason: message.toString(),
          wasClean: this._closeFrameReceived && this._closeFrameSent
        });

        event[kTarget] = this;
        callListener(handler, this, event);
      };
    } else if (type === 'error') {
      wrapper = function onError(error) {
        const event = new ErrorEvent('error', {
          error,
          message: error.message
        });

        event[kTarget] = this;
        callListener(handler, this, event);
      };
    } else if (type === 'open') {
      wrapper = function onOpen() {
        const event = new Event('open');

        event[kTarget] = this;
        callListener(handler, this, event);
      };
    } else {
      return;
    }

    wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
    wrapper[kListener] = handler;

    if (options.once) {
      this.once(type, wrapper);
    } else {
      this.on(type, wrapper);
    }
  },

  /**
   * Remove um ouvinte de evento.
   *
   * @param {String} type Uma string representando o tipo de evento para remover
   * @param {(Function|Object)} handler O ouvinte para remover
   * @public
   */
  removeEventListener(type, handler) {
    for (const listener of this.listeners(type)) {
      if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
        this.removeListener(type, listener);
        break;
      }
    }
  }
};

module.exports = {
  CloseEvent,
  ErrorEvent,
  Event,
  EventTarget,
  MessageEvent
};

/**
 * Chama um ouvinte de evento
 *
 * @param {(Function|Object)} listener O ouvinte para chamar
 * @param {*} thisArg O valor para usar como `this` ao chamar o ouvinte
 * @param {Event} event O evento para passar para o ouvinte
 * @private
 */
function callListener(listener, thisArg, event) {
  if (typeof listener === 'object' && listener.handleEvent) {
    listener.handleEvent.call(listener, event);
  } else {
    listener.call(thisArg, event);
  }
}
