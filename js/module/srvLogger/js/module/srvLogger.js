class Message {
    constructor() {
        this.Timestamp;
        this.Hash;
        this.Message;
        this.Level;
        this.Source;
        this.MetaData;
    }
}

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
    constructor(_sysBus, _logBus) {
        this._Enabled = false;
        this._sysBus = _sysBus;
        this._logBus = _logBus;
        this.Init();
    }
    /**
     * @method
     * @description
     * Инициализация объекта логгера
     * @param {Object} logBus           - шина логгера, по которой передаются сообщения для логирования
     * @param {Object} ServicesState    - объект-контейнер со службами фреймворка
     */
    Init() {
        this._sysBus.on('register', (_ServicesState) => {
            _ServicesState.SetServiceObject('Logger', this);
        })
        this._logBus.on('log', (msg) => {
            this.Log(this.LogLevel.INFO, msg)
        });
        this._Enabled = true;
       
        this.Log({source: 'Hub.Services.Logger', level: this.LogLevel.INFO, msg: "Service initialized."});
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
            DEBUG: 'DEBUG',
            INFO: 'INFO',
            NOTICE: 'NOTICE',
            WARN: 'WARN',
            ERROR: 'ERROR',
            CRITICAL: 'CRITICAL'
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
    Log(msg) {
        if (!this._Enabled) return;
        
        // TODO: добавить запись в базу данных
        if (this.LogLevel[msg.level]) {
            console.log(`${this.GetSystemTime()} [${msg.source}] -> ${this.LogLevel[msg.level]} : ${msg.msg}`);
            return true;
        }
        return false;
    }
}
module.exports = ClassLogger;