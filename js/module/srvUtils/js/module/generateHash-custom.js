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

function generateHash(_input, separator) {
  let input = _input;
  let output = '';

  // Если входные данные не переданы, генерируем случайное значение
  if (!input) {
    // Используем Math.random() и умножаем на текущее время с высоким разрешением
    input = (Math.random() * performance.now()).toString(36).substring(2);
  }

  // Преобразуем строку в массив байтов
  const bytes = new TextEncoder().encode(input);

  // Применяем простую хэш-функцию (например, FNV-1a)
  let hash = 2166136261n; // Начальное значение FNV-1a
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash *= 16777619n; // Множитель FNV
  }

  // Приводим хэш к 64 битам и получаем в шестнадцатеричном формате
  output = hash.toString(16).padStart(16, '0').slice(0, 16); // 64 бита = 16 символов

  // Если задан разделитель, вставляем его между каждыми 4 символами
  if (separator) {
    output = output.match(/.{1,4}/g).join(separator);
  }

  return output;
}

module.exports = generateHash;
