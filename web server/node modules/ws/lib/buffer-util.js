'use strict';

const { EMPTY_BUFFER } = require('./constants');

const FastBuffer = Buffer[Symbol.species];

/**
 * Mescla um array de buffers em um novo buffer.
 *
 * @param {Buffer[]} list O array de buffers a serem concatenados
 * @param {Number} totalLength O comprimento total dos buffers na lista
 * @return {Buffer} O buffer resultante
 * @public
 */
function concat(list, totalLength) {
  if (list.length === 0) return EMPTY_BUFFER;
  if (list.length === 1) return list[0];

  const target = Buffer.allocUnsafe(totalLength);
  let offset = 0;

  for (let i = 0; i < list.length; i++) {
    const buf = list[i];
    target.set(buf, offset);
    offset += buf.length;
  }

  if (offset < totalLength) {
    return new FastBuffer(target.buffer, target.byteOffset, offset);
  }

  return target;
}

/**
 * Mascara um buffer usando a máscara fornecida.
 *
 * @param {Buffer} source O buffer para mascarar
 * @param {Buffer} mask A máscara a ser usada
 * @param {Buffer} output O buffer onde armazenar o resultado
 * @param {Number} offset O deslocamento no qual começar a escrever
 * @param {Number} length O número de bytes para mascarar.
 * @public
 */
function _mask(source, mask, output, offset, length) {
  for (let i = 0; i < length; i++) {
    output[offset + i] = source[i] ^ mask[i & 3];
  }
}

/**
 * Desmascara um buffer usando a máscara fornecida.
 *
 * @param {Buffer} buffer O buffer para desmascarar
 * @param {Buffer} mask A máscara a ser usada
 * @public
 */
function _unmask(buffer, mask) {
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] ^= mask[i & 3];
  }
}

/**
 * Converte um buffer em um `ArrayBuffer`.
 *
 * @param {Buffer} buf O buffer para converter
 * @return {ArrayBuffer} O buffer convertido
 * @public
 */
function toArrayBuffer(buf) {
  if (buf.length === buf.buffer.byteLength) {
    return buf.buffer;
  }

  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
}

/**
 * Converte `data` em um `Buffer`.
 *
 * @param {*} data Os dados para converter
 * @return {Buffer} O buffer
 * @throws {TypeError}
 * @public
 */
function toBuffer(data) {
  toBuffer.readOnly = true;

  if (Buffer.isBuffer(data)) return data;

  let buf;

  if (data instanceof ArrayBuffer) {
    buf = new FastBuffer(data);
  } else if (ArrayBuffer.isView(data)) {
    buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
  } else {
    buf = Buffer.from(data);
    toBuffer.readOnly = false;
  }

  return buf;
}

module.exports = {
  concat,
  mask: _mask,
  toArrayBuffer,
  toBuffer,
  unmask: _unmask
};

/* istanbul ignore else  */
if (!process.env.WS_NO_BUFFER_UTIL) {
  try {
    const bufferUtil = require('bufferutil');

    module.exports.mask = function (source, mask, output, offset, length) {
      if (length < 48) _mask(source, mask, output, offset, length);
      else bufferUtil.mask(source, mask, output, offset, length);
    };

    module.exports.unmask = function (buffer, mask) {
      if (buffer.length < 32) _unmask(buffer, mask);
      else bufferUtil.unmask(buffer, mask);
    };
  } catch (e) {
    // Continue regardless of the error.
  }
}
