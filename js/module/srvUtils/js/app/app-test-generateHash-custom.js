const generateHash = require('../module/generateHash-custom.js');

// Примеры
console.log(generateHash()); // генерация случайного 64bit хэша
// result '472f8d77571393b8'
console.log(generateHash('b4:8a:0a:da:67:be')); // генерация 64bit хэша на основе входных данных
// result '0e878cf7030df45e'
console.log(generateHash('b4:8a:0a:da:67:be', '-')); // генерация 64bit хэша с разделителем '-'
// result '0e87-8cf7-030d-f45e'
