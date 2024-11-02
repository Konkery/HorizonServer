const EventEmitter = require('eventemitter2');

/**
 * @class
 * Класс шины.
 * Наследует EventEmitter. 
 */
class ClassBus_S extends EventEmitter {

    static #_BusInstances = [];
    #_Name;
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
        
        super();
        if (typeof _name === 'string')
            this.#_Name = _name;
        else 
            new Error('Invalid args');
        // 
        ClassBus_S.#_BusInstances.push(this);
        this.setMaxListeners(100);
    }

    /**
     * @getter
     * Имя шины
     */
    get Name() {
        return this.#_Name;
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
}

module.exports = ClassBus_S;

