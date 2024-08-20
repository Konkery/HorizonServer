const { EventEmitter } = require('events');

/**
 * @class
 * Класс шины.
 * Наследует EventEmitter. 
 */
class ClassBus_S extends EventEmitter {

    static #_BusInstances = [];
    #_DebugOn = false;
    #_LogBus;
    
    /**
     * @constructor
     * @param {string} _name - имя шины
     */
    constructor(_name) {
        // реализация Singleton
        const instance = ClassBus_S.#_BusInstances.find(bus => bus.Name == _name);
        if (instance instanceof ClassBus_S) return instance;
        // инициализация поля
        super();
        if (typeof _name === 'string')
            Object.defineProperty(this, '_Name', { writable: false, value: _name  });
        else 
            new Error('Invalid args');
        // 
        ClassBus_S.#_BusInstances.push(this);
    }

    /**
     * @getter
     * Имя шины
     */
    get Name() {
        return this._Name;
    }

    /**
     * @getter
     * Флаг указывающий на то, будут ли сообщения перенаправляться на logBus
     */
    get DebugOn() { 
        return this.#_DebugOn; 
    }

    /**
     * @getter
     * Флаг указывающий на то, будут ли сообщения перенаправляться на logBus
     */
    set DebugOn(flag) { 
        this.#_DebugOn = flag; 
    }

    /**
     * @method
     * @param {object} dependencies 
     */
    Init({ logBus }) {
        this.#_LogBus = logBus;
    }

    /**
     * @method
     * Рассылает сообщение о вызове события узлам
     * @param {string} eventName 
     * @param {[any]} argsArr 
     */
    #SendToLogBus(eventName, argsArr) {
        if (this.#_LogBus instanceof ClassBus_S) {
            this.#_LogBus.emit(eventName, ...argsArr);
            return true;
        }
        return false;
    }

    emit(eventName, ...args) {
        // пересылка сообщения на logBus
        if (this.DebugOn)
            this.#SendToLogBus(eventName, args);
        // базовая работа ивент эмиттера
        super.emit(eventName, ...args);
    }
}

module.exports = ClassBus_S;

