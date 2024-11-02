const generateHash = require('../module/generateHash.js');

//Пример использования
//  console.log(
  //  '<' + 'general v01' + '>-<' + 'project-channels' + '>-<' + generateHash(Date.now().toString(), '-') + '>'
//  ); // Генерация 64bit хэша с разделителем '-'

console.log(generateHash('INA3221', '-')); // Генерация 64bit хэша с разделителем '-'