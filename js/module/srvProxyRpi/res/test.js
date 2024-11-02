async function processArray(arr) {
    try {
        // Преобразуем массив в массив промисов
        const promises = arr.map(async (item) => {
            // Асинхронная операция на каждой итерации
            return await asyncOperation(item);
        });

        // Ожидаем завершения всех промисов (успех или ошибка)
        const results = await Promise.all(promises);

        // Действия после завершения всех операций
        return results;
    } catch (error) {
        console.error('Произошла ошибка:', error);
    }
}

async function asyncOperation(item) {
    // Пример асинхронной операции (например, запрос к API)
    await setTimeout(() => {
        // Успех
        console.log('object');
    }, 1000);
    return item;
}
(async () => {
const array = [1, 2, 3, 4, 5];
const res = await processArray(array);
console.log(res);
})();