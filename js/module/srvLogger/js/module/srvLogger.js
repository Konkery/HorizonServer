/**
 * @class
 * Класс предоставляет инструменты для логирования 
 */
class ClassLogger {
    /**
     * @constructor
     * @description
     * Конструктор класса логгера
     */
    constructor() {
        this._Enabled = false;
        this._logBus;
    }
    /**
     * @method
     * @description
     * Инициализация объекта логгера
     * @param {Object} logBus           - шина логгера, по которой передаются сообщения для логирования
     * @param {Object} ServicesState    - объект-контейнер со службами фреймворка
     */
    Init({logBus, _ServicesState}) {
        logBus.on('logInfo', (msg) => {
            this.Log(this.LogLevel.INFO, msg)
        });
        logBus.on('logDebug', (msg) => {
            this.Log(this.LogLevel.DEBUG, msg)
        });
        logBus.on('logWarn', (msg) => {
            this.Log(this.LogLevel.WARN, msg)
        });
        logBus.on('logError', (msg) => {
            this.Log(this.LogLevel.ERROR, msg)
        });
        this._Enabled = true;
        _ServicesState.SetServiceObject('Logger', this);
        this.Log(this.LogLevel.INFO, "Logger initialized!");
    }
    /**
     * @setter
     * @description
     * Показыывает, готов-ли логгер к работе
     * @param {Boolean} flag 
     */
    set Enabled(flag) {
        if (typeof flag === 'boolean') {
            this._Enabled = flag;
            return true;
        }
        return false;    
    }
    /**
     * @getter
     * @description
     * Объект с уровнями логов
     */
    get LogLevel() {
        return ({
            INFO: 'INFO',
            DEBUG: 'DEBUG',
            ERROR: 'ERROR',
            WARN: 'WARN'
        });
    }
    /**
     * @method
     * @description
     * Возвращает строку с датой и временем в установленном формате
     * @returns datetime        - строка с датой и временем         
     */
    GetSystemTime() {
        let date = new Date(); 
        let datetime = (date.getFullYear() + "-" + ("0" + (date.getMonth() + 1)).substr(-2) +
        "-" + ("0" + date.getDate()).substr(-2) + " " + ("0" + date.getHours()).substr(-2) +
        ":" + ("0" + date.getMinutes()).substr(-2) + ":" + ("0" + date.getSeconds()).substr(-2));

        return datetime;
    }
    /**
     * @method
     * @description
     * Записывает сообщение в БД и выводит её в консоль
     * @param {Object} qlfier   - уровень логирования 
     * @param {String} msg      - текст сообщения
     * @returns 
     */
    Log(qlfier, msg) {
        if (!this._Enabled) return;
        
        // TODO: добавить запись в базу данных
        if (this.LogLevel[qlfier]) {
            console.log(`[${this.GetSystemTime()}] ${qlfier}>> ${msg}`);
            return true;
        }
        return false;
    }
}
module.exports = ClassLogger;