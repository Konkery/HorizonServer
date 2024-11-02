const fnv = require('fnv-plus');

/**
 *
 * @param   {string} _input
 * @param   {string} _separator
 * @returns {string}
 * @description Функция принимает текстовый аргумент '_input' и генерирует 64bit хэш значение.
 * Если задан аргумент '_separator', то вставляет его между каждыми 4 символами.
 * Если входное аргумент '_input' не задан, то генерируется хэш на основе случайно сгенерированного
 * случайного значения.
 * @example
 * generateHash('b4:8a:0a:da:67:be', '-') -> result '0e87-8cf7-030d-f45e'
 */
function generateHash(_input, _separator) {
  let input = _input;
  let output = '';

  // Если входные данные не переданы, генерируем случайное значение
  if (!input) {
    // Используем Math.random() и умножаем на текущее время с высоким разрешением
    input = (Math.random() * performance.now()).toString(36).substring(2);
  }

  // генерируем хэш значение на основе 'FNV-1' функции
  output = fnv.fast1a64(input);

  // Если задан разделитель, вставляем его между каждыми 4 символами
  if (_separator) {
    output = output.match(/.{1,4}/g).join(_separator);
  }

  return output;
}

module.exports = generateHash;
