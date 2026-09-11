/** 
 * @typedef {object} ProcessConfig
 * @property {Function} executeFunc     - функция - обработчик задачи из очереди
 * @property {Function} onResult        - функция, вызываемая при выполнении задачи
 * @property {Integer} timeoutMs        - таймаут в милисекундах, после которых выполнение текущей задачи прерывается
 * @property {Integer} maxFailCount     - максимальное количество ошибок подряд, после которого прерывается выполнение очереди
 * @property {Integer} minIntervalMs    - интервал в милисекундах между выполнением задач из очереди
 */

/**
 * @class
 * @description Класс реализует асинхронную работу с очередями не зависимо от их типа
 */
class AsyncQueueProcessor {
    #_executeFunc;
    #_onResult;
    #_timeoutMs;
    #_maxFailCount;
    #_minIntervalMs;

    #_maxSize;
    #_size;
    #_head;
    #_tail;

    #_queue;
    #_isProcessing;
    #_isStopped;
    #_failCounter;

    #_waitResolve;
    #_waitPromise;
    /**
     * @constructor
     * @param {ProcessConfig} param0    - параметры обработчика очереди
     */
    constructor( _executeFunc, _onResult, _timeoutMs, _maxFailCount, _minIntervalMs ) {
        if (typeof _executeFunc !== 'function') throw 'executeFunc must be a function';
        if (typeof _onResult !== 'function') throw 'onResult must be a function';

        this.#_executeFunc = _executeFunc;
        this.#_onResult = _onResult;
        this.#_timeoutMs = _timeoutMs;
        this.#_maxFailCount = _maxFailCount;
        this.#_minIntervalMs = _minIntervalMs;

        this.#_maxSize = 200;

        this.#_queue = new Array(this.#_maxSize);
        this.#_size = 0;
        this.#_head = 0;
        this.#_tail = 0;

        this.#_isProcessing = false;
        this.#_isStopped = false;
        this.#_failCounter = 0;

        // Для ожидания новых задач при пустой очереди
        this.#_waitResolve = null;
        this.#_waitPromise = null;

        this.Start();
    }

    /**
     * @getter
     * @description Тип соединения modbus
     */
    get Size() {
        return this.#_size;
    }

    /**
     * @method
     * @description Помещает задачу в очередь
     * @param {Object} task     - объект обработки, зависит от класса, который использует обработку очередей 
     * @returns 
     */
    Enqueue(task) {
        if (this.#_isStopped) {
            return false;
        }
        if (this.#_size >= this.#_maxSize) {
            this.Clear();
            console.log(`Max queue size for ${task.source} reached: ${this.#_maxSize}. Dropping queue`);
            this.#_onResult(`Max queue size for ${task.source} reached: ${this.#_maxSize}. Dropping queue`, null, undefined);
        }
        this.#_queue[this.#_tail] = task;
        this.#_tail = (this.#_tail + 1) % this.#_maxSize;
        this.#_size++;
        this.Unfreeze();
        return true;
    }

    /**
     * 
     * @returns 
     */
    Dequeue() {
        if (this.#_size === 0) return undefined; // очередь пуста
        let task = this.#_queue[this.#_head];
        // (опционально) удаляем ссылку на объект
        this.#_queue[this.#_head] = undefined;
        this.#_head = (this.#_head + 1) % this.#_maxSize;
        this.#_size--;

        return task;
    }

    /**
     * @method
     * @description Запускает или перезапускает обработку очереди
     */
    Start() {
        if (this.#_isStopped) {
            this.#_isStopped = false;
            this.#_failCounter = 0;
        }
        if (!this.#_isProcessing) {
            this.ProcessLoop().catch(err => {
                this.#_onResult(`Fatal error in AsyncQueueProcessor loop: ${err}`, null, undefined);
                this.#_isProcessing = false;
            });
        } else {
            this.Unfreeze();
        }
    }

    Unfreeze() {
        if (this.#_waitResolve) {
            this.#_waitResolve();
            this.#_waitResolve = null;
            this.#_waitPromise = null;
        }
    }

    /**
     * @method
     * @description Основной цикл обработки очереди.
     */
    async ProcessLoop() {
        if (this.#_isProcessing) return;
        this.#_isProcessing = true;

        let lastStartTime = 0;

        while (!this.#_isStopped) {
            // Если очередь пуста – засыпаем до добавления новой задачи
            if (this.#_size === 0) {
                this.#_waitPromise = new Promise(resolve => {
                    this.#_waitResolve = resolve;
                });
                await this.#_waitPromise;
                // При пробуждении сбрасываем lastStartTime, чтобы интервал не применялся
                //lastStartTime = 0;
                continue;
            }

            let task = this.Dequeue();

            // Проверяем лимит ошибок
            if (this.#_failCounter >= this.#_maxFailCount) {
                this.#_isStopped = true;
                this.#_onResult(1, null, task);
                // Отклоняем оставшиеся задачи
                this.Clear();
                this.Unfreeze();
                break;
            }

            // Вычисляем задержку до начала следующей задачи
            /*if (lastStartTime > 0 && this.#_minIntervalMs > 0) {
                const now = Date.now();
                const elapsed = now - lastStartTime;
                if (elapsed < this.#_minIntervalMs) {
                    const delay = this.#_minIntervalMs - elapsed;
                    await this.Sleep(15);
                }
                console.log(Date.now() - now);
            }*/
            
            /*const startTime = Date.now();
            lastStartTime = startTime;*/

            //console.log(Date.now() - lastStartTime);
            //lastStartTime = Date.now();

            try {
                let result = await this.Execute_with_timeout(task);
                this.#_failCounter = 0;
                this.#_onResult(null, result, task);
            } catch (err) {
                this.#_failCounter++;
                this.#_onResult(err, null, task);
            }

            await this.Sleep(15);
        }

        this.#_isProcessing = false;
    }

    /**
     * @method
     * @description Выполнение задачи из очереди с учётом таймаута
     * @param {any} task                - задача на выполнение
     * @returns {Promise<any>} promise  - промис
     */
    Execute_with_timeout( _task ) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(2);
            }, this.#_timeoutMs);

            this.#_executeFunc( _task.comm )
                .then((result) => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch((err) => {
                    clearTimeout(timer);
                    reject(err);
                });
        });
    }

    /**
     * @method
     * @description Останавливает выполнение процесса на указанное количество милисекунд
     * @param {Integer} _ms                 - пауза в милисекундах
     * @returns {Promise<any>} promise      - промис
     */
    Sleep( _ms ) {
        return new Promise(resolve => setTimeout(resolve, _ms));
    }

    /**
     * 
     */
    Clear() {
        this.#_size = 0;
        this.#_head = 0;
        this.#_tail = 0;
        this.#_queue.fill(undefined);
    }
}

module.exports = AsyncQueueProcessor;