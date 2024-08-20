const BusMsg = require("./HrzBusMsg");
const ClassHrzInterface_S = require("./srvHrzInterface");
const ClassNRInterface_S = require("./srvNRInterface");

const STATUS_NOT_ACTIVE = 'not-active';
const STATUS_ACTIVE = 'active';
// TODO: расширить список возможных статусов
/**
 * @class
 * Базовый класс серверной службы фреймворка Horizon. 
 * Реализует её идентификацию и обеспечивает работу по двум интерфейсами: интерфейсу Hrz, который связан с шинами фреймворка, и интерфейсу Node-RED.  
 */
class ClassService_S {
    #_Name;
    #_BusesConfig = [];
    #_NRInterface;
    #_HrzInterface;
    #_Status;
    /**
     * @constructor
     * @param {string} _name - имя службы
     * @param {object} _busesConfig - используемые шины
     */
    constructor(_name, _busesConfig) {
        this.#_Name         = _name;
        this.#_BusesConfig  = _busesConfig;
        this.#_NRInterface  = ClassNRInterface_S(this.Name);//TODO: добавить передачу node
        this.#_HrzInterface = null;                         // инициализация происходит в Init
        this.#_Status       = STATUS_NOT_ACTIVE;

        this.#_NRInterface.AddHandler('init', this.Init);   // TODO: актуализировать имя команды
    }

    /**
     * @getter
     * @description Имя службы
     */
    get Name() {
        return this.#_Name;
    }

    /**
     * @getter
     * @description Node-RED интерфейс службы
     */
    get NRInterface()  { return this.#_NRInterface };

    /**
     * @getter
     * @description Horizon-интерфейс службы 
     */
    get HrzInterface() { return this.#_HrzInterface };

    /**
     * @getter
     * @description Статус службы
     */
    get Status() { return this.#_Status; }

    /**
     * @method
     * @description Сохраняет ссылки на используемые шины, информацию об источниках и инициализирует базовые обработчики сообщений
     * @param {object} _msg 
     */
    Init({ topic, payload: { com, arg, source, destinations, value } }) {

        if (destinations.includes(this.Name) /* && source === 'proc' */) {
            // ...
            // TODO: актуализировать как получить переданный объект с шинами
            // выбираются шины, имена которых были переданы в конструкторе
            const busesToUse = arg.filter(bus => this.#_BusesConfig.includes(bus.Name));
            this.#_NRInterface = new ClassHrzInterface_S(this.Name, busesToUse);
        }
    }
}

module.exports = ClassService_S;