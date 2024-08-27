/** зависимости */
// 'D:\\HorizonServer\\js\\module\\srvBusMsg\\js\\module\\srvBusMsg.js'
const { ClassBusMsg_S, constants: MSG_CONST } = require('srvBusMsg');
// 'D:\\HorizonServer\\js\\module\\srvBus\\js\\module\\srvBus.js'
const ClassBus_S       = require('srvBus');
const { EventEmitter } = require('events');
/********************************* */

/** константы */
const EVENT_INIT = 'init1';
const STATUS_NOT_ACTIVE = 'not-active';
const STATUS_ACTIVE = 'active';

const EVENT_BUS_NEW_MSG = 'new-bus-msg'; //новое сообщение на шине
const EVENT_NEW_SOURCE = 'get-new-source'; //обновлен глобальный список источников (и соответственно шин)
const DESTINATIONS_ALL = 'all';
const NR_PSEUDOBUS_NAME = 'nr';
const DFLT_SEND_TIMEOUT = 3000;

const ERROR_ALREADY_INSTANCED =
    'Service with this name has been instanced already';
const ERROR_INVALID_SERVICE_NAME = 'Invalid service name';
/********************************* */
/** списки топиков */
const EVENT_ON_LIST_NR_LIST = ['all-run'];
const EVENT_ON_LIST_SYSBUS_LIST = ['all-init1', 'all-new-source'];
/********************************* */

/** вспомогательные функции */
const capitalizeFunc = (str) => str.charAt(0).toUpperCase() + str.slice(1);
const getBusHandlerName = (_busName) => `HandlerEvents${capitalizeFunc(_busName)}`;
const getEventOnListName = (_busName) => `EVENT_ON_LIST_${_busName.toUpperCase()}`;
const getEventEmitListName = (_serviceName) => `EVENT_EMIT_${_serviceName.toUpperCase()}_LIST`;
/********************************* */

/**
 * @class
 * Базовый класс серверной службы фреймворка Horizon.
 * Реализует её идентификацию и обеспечивает работу по двум интерфейсами: интерфейсу Hrz, который связан с шинами фреймворка, и интерфейсу Node-RED.
 */
class ClassBaseService_S {
    static #_ServicesNameList = [
        'proc',
        'logger',
        'proxywsс',
        'dm',
        'wsc',
        'providermdb',
    ];
    static #_InstancedNameList = []; // статическая коллекция инициализированных служб
    #_Name;             // имя службы
    #_BusNamesList;     // список имен шин, требуемых службе
    #_Status;
    #_GlobalBusList;    // глобальная коллекция инициализированных шин
    #_Node;             // объект node
    #_BusHandler  = {}; // объект, хранящий агрегатные обработчики шин
    #_HandlerFunc = {}; // хранит значения типа 'топик события : функция обработчик'
    #_EmitFunc    = {}; // хранит значения типа 'топик события': функция-emit
    #_ServicesState;    // объект служб
    #_InputInterface;   // прослойка между шиной и службой: обеспечивает мультиплексирование сообщений от обработчика шины на обработчики команд `com`
    #_ServicesWorkWith = new Set(); // коллекция имен служб, на которые будет выполняться рассылка сообщений
    _BusList = {};      // объект-коллекция шин, используемых службой
    /**
     * @typedef {Object} ServiceOpts
     * @property {string} name - имя службы
     * @property {[string]} busNamesList - список имен используемых шин
     * @property {object} busList - глобальная коллекция инициализированных шин
     * @property {object} node - объект узла, через который происходит рассылка сообщений
     */
    /**
     * @constructor
     * @param {ServiceOpts} _serviceOpts
     */
    constructor({ name, busNamesList, busList, node }) {
        /* реализация Singleton */
        const instancedAlready =
            ClassBaseService_S.#_InstancedNameList.includes(name);
        // если служба уже была создана - ошибка
        if (instancedAlready) throw new Error(ERROR_ALREADY_INSTANCED);
        const validName = ClassBaseService_S.#_ServicesNameList.includes(name);
        // неожиданное имя службы - ошибка
        if (!validName) throw new Error(ERROR_INVALID_SERVICE_NAME);
        /* *******************  */
        this.#_Name = name; 
        this.#_BusNamesList = busNamesList;
        this.#_Status = STATUS_NOT_ACTIVE;
        this.#_GlobalBusList = busList;
        this.#_InputInterface = new EventEmitter();
        // инициализация Node-red интерфейса службы
        if (typeof node?.send === 'function') this.InitNR(node);
        // подтягивание требуемых шин из глобального объекта
        this.UpdateBusList();

        // подписка на системные события
        this.FillEventOnList(NR_PSEUDOBUS_NAME, EVENT_ON_LIST_NR_LIST);
        this.FillEventOnList('sysBus', EVENT_ON_LIST_SYSBUS_LIST);

        /* старая версия для наглядности 
        this._BusList.sysBus.on(EVENT_INIT, this.HandlerInit1.bind(this));
        this._BusList.sysBus.on(EVENT_NEW_SOURCE, this.UpdateBusList.bind(this));
        */
        ClassBaseService_S.#_InstancedNameList.push(name);
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
     * @description Статус службы
     */
    get Status() {
        return this.#_Status;
    }

    /**
     * @method
     * @description Заполняет коллекцию имен топиков, на которые выполняется подписка, на каждую шину.
     * Создание массива типа EVENT_ON_LIST_SYSBUS
     * @param {string} _busName - имя шины, по которой получаем сообщение
     * @param {...string} eventNames
     */
    FillEventOnList(_busName, ...eventNames) {
        const listName = getEventOnListName(_busName);
        if (!Array.isArray(this[listName]))
            Object.defineProperty(this, listName, {
                writable: false,
                configurable: false,
                value: []
        });
        this[listName].push(...eventNames);
    }

    /**
     * @method
     * @description Заполняет коллекцию топиков, по которым передается сообщение, на каждую шину.
     * Создание массива типа EVENT_EMIT_DM_LIST
     * @param {string} _serviceName - имя службы, на которую уходит ответ
     * @param {...string} eventNames
     */
    FillEventEmitList(_serviceName, ...eventNames) {
        if (!ClassBaseService_S.#_ServicesNameList.includes(_serviceName) && _serviceName !== 'all') {
            // TODO: вероятно ошибка
        }
        this.#_ServicesWorkWith.add(_serviceName);
        const listName = getEventEmitListName(_serviceName);
        if (!Array.isArray(this[listName]))
            Object.defineProperty(this, listName, {
                writable: false,
                configurable: false,
                value: []
        });
        this[listName].push(...eventNames);
    }
    /**
     * @method
     * @private
     * @description Создает глобальный обработчик событий на шину по её имени.
     * @param {string} _busName 
     */
    #CreateBusHandler(_busName) {
        return ((_topic, _data) => {
            const func = this.#_HandlerFunc[_topic];
            func?.(_topic, _data);
        });
    }

    /**
     * @method
     * @private
     * @description добавляет агрегатный обработчик каждой из используемых шин
     */
    #AddHandlerEvents() {
        Object.keys(this._BusList)
        .forEach(_busName => {
            // восстановление имени списка топиков (событий) шины
            const topicListName = this[getEventOnListName(_busName)];
            // обращение к собственно списку
            const topicList = this[topicListName];
            // перебор всех топиков внутри списков и установка обработчиков на них
            topicList?.forEach(_topic => {
                // обращение к агрегатному обработчику шины
                const busHandler = this.#CreateBusHandler(_busName);
                this.#_BusHandler[_busName] = busHandler;

                /* если busHandler извлекается из свойств/методов класса
                const busHandler = this[getBusHandlerName(_busName)]; */

                // подписка агрегатного обработчика на топик
                this._BusList[_busName]?.on(_topic, busHandler.bind(this));
            });
        });
    }

    /**
     * @method
     * @private
     * @description метод выполняет начальную, безусловную инициализацию обработчиков событий всех шин
     */
    #InitHandlerFunc() {
        //итерация имен шин
        Object.keys(this._BusList)
            // преобразование имен шин в имена списков событий этих шин     Пример: sysBus -> EVENT_ON_LIST_SYSBUS
            .map((busName) => this[getEventOnListName(busName)])
            // отбрасывание имен списков, которые ранее не были инициализированы в объекте // TODO: оценить возможна ли такая ситуация
            .filter((eventList) => Array.isArray(this[eventList]))
            .forEach((eventList) => {
                eventList.forEach((topic) => {
                    // Формируем имя обработчика, убирая префикс <имя-службы> и заменяя '-' на '_'
                    const handlerName = `HandlerEvents_${topic
                        .replace(/-/g, '_')}`;
                    this.#_HandlerFunc[topic] = this[handlerName]?.bind(this);  //TODO возможно использовать ??= чтобы избежать переприсваивания функция
                });
            });
    }

    #InitEmitFunc() {
        this.#_ServicesWorkWith.forEach(_serviceName => {
            // обращение к списку топиков, связанных с эмит-функциями
            const emitList = this[getEventEmitListName(_serviceName)];
            // обработка списка эмиттеров каждой службы
            emitList?.forEach(topic => {
                // Формируем имя эмиттера
                const emitName = `EmitEvents_${topic
                    .replace(/-/g, '_')}`;
                this.#_EmitFunc[topic] = this[emitName]?.bind(this);
            })
        })
    }
    /**
     * @method
     * @description Сохраняет ссылки на используемые шины, информацию об источниках и инициализирует базовые обработчики сообщений
     * @param {object} dependencies
     */
    async HandlerInit1({ ServicesState, SourcesState }) {
        this.#_ServicesState ??= ServicesState;
        this.#_ServicesState.SetServiceObject(this.Name, this);

        this.UpdateBusList();
    }
    /**
     * @method
     * @description Обработчик события all-init1
     * @param {string} _topic 
     * @param {object} _data 
     */
    HandlerEvents_all_init1(_topic, _data) {
        const { ServicesState } = _data;
        this.#_ServicesState ??= ServicesState;
        this.#_ServicesState.SetServiceObject(this.Name, this);

        this.UpdateBusList();
    } 
    /**
     * @method
     * @description Обработчик события all-new-source
     * @param {string} _topic 
     * @param {object} _data 
     */
    HandlerEvents_all_new_source(_topic, _data) {
        this.UpdateBusList();
    }

    HandlerEvents_all_run(_topic, _data) {
        // 
    }

    EmitEvents_all_get_msg_nr(_topic, _data) {
        this.#_Node.send({ topic: _topic, payload: _data });
    }
    
    /**
     * @method
     * @description Обновляет коллекцию используемых шин
     */
    UpdateBusList() {
        Object.keys(this.#_GlobalBusList)
            .filter((busName) => this.#_BusNamesList.includes(busName))
            .forEach((busName) => {
                this._BusList[busName] = bus;
                this.#CreateBusHandler(bus);
            });
    }
    /**
     * @method
     * @description Устанавливает обработчик на шину, который транслирует вх.сообщения на внутренний интерфейс службы
     * @param {ClassBus_S} _bus
     */
    #CreateBusHandler(_bus) {
        _bus.on(EVENT_BUS_NEW_MSG, (_msg) => {
            const { topic, payload } = _msg;
            const { destinations, com } = payload;
            // проверка destinations
            const destMatch =
                destinations?.includes(this.Name) || destinations === DESTINATIONS_ALL;
            if (destMatch) {
                const eventName = `${_bus.Name}-${com}`;
                this.#_InputInterface.emit(eventName, _msg);
            }
        });
    }

    /**
     * @method
     * @description Создает обработчик для сообщения
     * @param {string} _busName - имя шины
     * @param {string} _com  - имя сообщения/события
     * @param {Function} _func - функция-обработчик
     */
    AddComHandler(_busName, _com, _func) {
        const eventName = `${_busName}-${_com}`;
        this.#_InputInterface.on(eventName, (_msg) => {
            if (true)
                //TODO: возможно разместить доп.проверки на корректность типа вх сообщений / статус службы
                _func(_msg);
        });
    }

    /**
     * @method
     * @description
     * Отправляет сообщение на шину
     * @param {string} _busName - имя шины, на которую отправляется сообщение
     * @param {ClassBusMsg_S}  _msg - сообщение
     * @param {object} _opts - дополнительные параметры отправки сообщения
     * @returns
     */
    async SendMsg(_busName, _msg, _opts) {
        // TODO: проверка что шина с таким именем существует
        let bus = this._BusList[_busName];
        // проверка и создание объекта сообщения
        let msg = this.CreateMsg(_msg);
        // штатная отправка сообщения
        if (bus instanceof EventEmitter && msg)
            return this.#SendMsgOnBus(
                bus,
                msg,
                _opts ?? { timeout: DFLT_SEND_TIMEOUT }
            );

        return new Promise((res) => res(undefined)); //возвращение промиса, который вернет undefined
    }

    /**
     * @method
     * @description
     * Отправляет сообщение на шину
     * @param {EventEmitter} _bus - объект шины, на которую отправляется сообщение
     * @param {ClassBusMsg_S}  _msg - сообщение
     * @param {number}  _opts - дополнительные параметры отправки сообщения
     * @returns
     */
    async #SendMsgOnBus(_bus, _msg, _opts) {
        _bus.emit(EVENT_BUS_NEW_MSG, _msg);
        // если метод вызван с флагом запроса
        if (_msg.payload.type === MSG_CONST.MSG_TYPE_REQUEST) {
            return new Promise((resolve, reject) => {
                // одноразовая подписка на сообщение с именем hash направляемого запроса
                const eventName = `${_bus.Name}-${_msg.payload.com}-res`;
                console.log(`send ${eventName}`);
                this.#_InputInterface.once(eventName, (response) => resolve(response));
                // взведение таймаута по которому будет вызван reject
                // TODO: продумать нужен ли reject из функции       // setTimeout(() => reject(`Timeout error`), _timeout);
                setTimeout(() => resolve(undefined), _opts.timeout);
            });
        }
    }

    /**
     * @method
     * @description
     * Формирует сообщение-ответ и отправляет его на шин
     * @param {string} _req - объект сообщения-запроса, на который формируется ответ
     * @param {string} _busName - имя шины, на которую отправляется сообщение
     * @param {ClassBusMsg_S}  _msg - сообщение
     * @returns
     */
    async SendResMsg(_req, _busName, _msg) {
        if (typeof _msg === 'object') {
            _msg.topic = _req.payload.hash;
            _msg.destinations = [_req.payload.source];
            _msg.payload.type = MSG_CONST.MSG_TYPE_RESPONSE;

            this.SendHrz(_busName, _msg);
        }
    }

    /**
     * @method
     * @description Инициализирует интерфейс для приема сообщений, пришедших от node-red узлов
     * @public
     * @param {*} _node
     */
    InitNR(_node) {
        this.#_Node = _node;
        this._BusList[NR_PSEUDOBUS_NAME] = new EventEmitter();

        /*this._BusList[NR_PSEUDOBUS_NAME].on(EVENT_BUS_NEW_MSG, (msg) =>
            this.#_Node.send(msg)
        );*/
    }

    /**
     * @method
     * @public
     * Принимает сообщение, ранее полученное по Node-RED
     * @param {ClassBusMsg_S} _msg
     */
    ReceiveNR({ topic, payload }) {
        this._BusList[NR_PSEUDOBUS_NAME].emit(topic, payload);
    }

    /**
     * @method
     * @public
     * @description Создает объект класса BusMsg
     * @param {*} _msg
     * @returns
     */
    CreateMsg(_msg) {
        try {
            // преобразование объекта сообщения
            _msg.payload.source = this.#_Name;
            return new ClassBusMsg_S(_msg);
        } catch {
            return null;
        }
    }
}

module.exports = ClassBaseService_S;
