/** зависимости */
// const { ClassBusMsg_S, constants: MSG_CONST } = require('D:\\HorizonServer\\js\\module\\srvBusMsg\\js\\module\\srvBusMsg.js');
const { ClassBusMsg_S, constants: MSG_CONST } = require('srvBusMsg');

// const ClassBus_S       = require('D:\\HorizonServer\\js\\module\\srvBus\\js\\module\\srvBus.js');
const ClassBus_S       = require('srvBus');
const { EventEmitter } = require('events');
/********************************* */

/** константы */
const EVENT_INIT = 'init1';
const STATUS_INACTIVE = 'inactive';
const STATUS_ACTIVE = 'active';

const EVENT_BUS_NEW_MSG = 'new-bus-msg'; //новое сообщение на шине
const EVENT_NEW_SOURCE = 'get-new-source'; //обновлен глобальный список источников (и соответственно шин)
const DESTINATIONS_ALL = 'all';
const NR_BUS_NAME = 'nr';
const DFLT_SEND_TIMEOUT = 3000;

const ERROR_ALREADY_INSTANCED =
    'Service with this name has been instanced already';
const ERROR_INVALID_SERVICE_NAME = 'Invalid service name';
/********************************* */
/** списки топиков */
const EVENT_ON_LIST_NR = ['all-run'];
const EVENT_ON_LIST_SYSBUS = ['all-init0', 'all-init1', 'all-close', 'all-new-source'];
/********************************* */

/** вспомогательные функции */
const capitalizeFunc = (str) => str.charAt(0).toUpperCase() + str.slice(1);
const getBusHandlerName = (_busName) => `HandlerEvents${capitalizeFunc(_busName)}`;
const getEventOnListName = (_busName) => `EVENT_ON_LIST_${_busName.toUpperCase()}`;
const getEventEmitListName = (_serviceName) => `EVENT_EMIT_${_serviceName.toUpperCase()}_LIST`;
const getResponseTopic = (_topic, _receiverName) => {       // proc-get-data -> this.Name-get-data
    const [ destName, ...com ] = _topic.split('-');
    return `${_receiverName}-${com.join('-')}`;
};      
const getEventHandlerName = (_topic) => `HandlerEvents_${_topic.replace(/-/g, '_')}`;
const getEventEmitName = (_topic) => `EmitEvents_${_topic.replace(/-/g, '_')}`;
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
        'proxyhub',
        'dm',
        'wsc',
        'providermdb',
    ];
    static #_InstancedNameList = []; // статическая коллекция инициализированных служб
    #_Name;             // имя службы
    #_BusNameList;     // список имен шин, требуемых службе
    #_Status;
    #_GlobalBusList;    // глобальная коллекция инициализированных шин
    #_Node;             // объект node
    #_EventOnList    = {}; // коллекция всех событий, которые слушает служба по шине (ключ - имя шины)
    #_EventEmitList  = {}; // коллекция всех событий, которые направляются слушателю (ключ - имя слушателя)
    #_BusHandlerList = {}; // объект, хранящий агрегатные обработчики шин
    #_HandlerFunc = {};  // хранит значения типа 'топик события : функция обработчик'
    #_EmitFunc    = {};  // хранит значения типа 'топик события': функция-emit
    #_PromiseList = {};  // контейнер с промисами, привязанными к запросам
    #_ServicesState;     // объект служб
    #_BusList = {};      // объект-коллекция шин, используемых службой
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
    constructor({ _name, _busNameList, _busList, _node }) {
        /* реализация Singleton */
        const instancedAlready =
        ClassBaseService_S.#_InstancedNameList.includes(_name);
        // если служба уже была создана - ошибка
        if (instancedAlready) throw new Error(ERROR_ALREADY_INSTANCED);
        /* закомментировано на пока не устаканится список служб
        const validName = ClassBaseService_S.#_ServicesNameList.includes(_name);
        // неожиданное имя службы - ошибка
        if (!validName) throw new Error(ERROR_INVALID_SERVICE_NAME);*/
        /* *******************  */
        this.#_Name = _name; 
        this.#_BusNameList = _busNameList;
        this.#_Status = STATUS_INACTIVE;
        this.#_GlobalBusList = _busList;
        // инициализация Node-red интерфейса службы
        if (typeof _node?.send === 'function') this.InitNR(_node);      
        // подтягивание требуемых шин из глобального объекта
        this.UpdateBusList();
        // подписка на системные события
        this.FillEventOnList('sysBus', EVENT_ON_LIST_SYSBUS);

        ClassBaseService_S.#_InstancedNameList.push(_name);
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
     * @param {string} _busName - имя шины, по которой получаем сообщение
     * @param {...string} _topicNames
     */
    FillEventOnList(_busName, _topicNames) {
        this.#_EventOnList[_busName] ??= [];
        this.#_EventOnList[_busName].push(
            _topicNames.filter(topicName => !this.#_EventOnList[_busName].find(event => event.name === topicName))
            .map(topicName => ({ name: topicName, on: false }))
        );
        // инициализация агрегатных обработчиков
        this.#AddHandlerEvents();
        // наполнение _HandleFunc ссылками на методы-обработчики переданных событий
        this.#PackHandlerFunc();
    }
    /**
     * @method
     * @description Заполняет коллекцию топиков, по которым передается сообщение, на каждую шину.
     * @param {string} _serviceName - имя службы, на которую уходит ответ
     * @param {[string]} eventNames
     */
    FillEventEmitList(_serviceName, _topicNames) {
        if (!ClassBaseService_S.#_ServicesNameList.includes(_serviceName) && _serviceName !== 'all') {
            // TODO: вероятно ошибка
        }
        this.#_EventEmitList[_serviceName] ??= [];
        this.#_EventEmitList[_busName].push(
            _topicNames.filter(topicName => !this.#_EventOnList[_busName].find(event => event.name === topicName))
            .map(topicName => ({ name: topicName }))
        );
        // наполнение _EmitFunc ссылками на методы-эмиттеры
        this.#PackEmitFunc();
    }
    /**
     * @method
     * @private
     * @description Создает глобальный обработчик событий на шину по её имени.
     * @param {string} _busName 
     */
    #CreateBusHandler(_busName) {
        console.log(`${this.Name} | #CreateBusHandler | new ${_busName} handler`);
        return ((_topic, _msg) => {
            try {
                const { type } = _msg.metadata; 
                // если получен ответ на запрос
                if (type === MSG_CONST.MSG_TYPE_RESPONSE) {
                    const { hash } = _msg.metadata;
                    // ищем в контейнере по хэшу
                    this.#_PromiseList[hash]?.res(true);
                }
            } catch (e) {
                console.log(`Error while processing msg ${_msg?.hash}`);
                return;
            }
            const handlerFunc = this.#_HandlerFunc[_topic];
            handlerFunc?.(_topic, _msg); 
        });
    }
    /**
     * @method
     * @private
     * @description добавляет агрегатный обработчик каждой из используемых шин
     */
    #AddHandlerEvents() {
        Object.keys(this.#_BusList).forEach(_busName => {
            // обращение к собственно списку
            const eventList = this.#_EventOnList[_busName].filter(event => event.on == false)
            // перебор всех топиков внутри списков и установка обработчиков на них
            eventList?.forEach(_event => {
                const topic = _event.name;
                // обращение к агрегатному обработчику шины
                this.#_BusHandlerList[_busName] ??= this.#CreateBusHandler(_busName).bind(this);
                const busHandler = this.#_BusHandlerList[_busName];

                // подписка агрегатного обработчика на топик
                console.log(`${this.Name} | AddHandlerEvents | add handler on topic ${topic}`);
                this.#_BusList[_busName]?.on(topic, _msg => busHandler(topic, _msg));
                _event.on = true;
            });
        });
    }
    /**
     * @method
     * @private
     * @description сохраняет функции-обработчики в объект
     */
    #PackHandlerFunc() {
        Object.values(this.#_EventOnList[_busName])
        .forEach(_eventList => {
            _eventList.forEach(_event => {
                if (_event.on) {
                    const topic = _event.name;
                    // Формируем имя обработчика, заменяя '-' на '_'
                    const handlerName = getEventHandlerName(topic);
                    this.#_HandlerFunc[topic] ??= this[handlerName]?.bind(this);
                }
            });
        });
    }
    /**
     * @method
     * @private
     * @description собирает методы-эмиттеры в один объект
     */
    #PackEmitFunc() {
        Object.keys(this.#_EmitFunc).forEach(_serviceName => {
            // обращение к списку топиков, связанных с эмит-функциями
            const emitList = this.#_EmitFunc[_serviceName];   //this[getEventEmitListName(_serviceName)];
            // обработка списка эмиттеров каждой службы
            emitList?.forEach(_topic => {
                // Формируем имя эмиттера
                const emitName = getEventEmitName(_topic);
                this.#_EmitFunc[_topic] = this[emitName]?.bind(this);
            })
        });
    }
    /**
     * @method
     * @description Обработчик события all-init0
     * @param {string} _topic 
     * @param {object} _msg 
     */
    HandlerEvents_all_init0(_topic, _msg) { } 
    /**
     * @method
     * @description Обработчик события all-init1
     * @param {string} _topic 
     * @param {object} _msg 
     */
    HandlerEvents_all_init1(_topic, _msg) {
        console.log(`super HandlerEvents_all_init1`);
        const { ServicesState } = _msg.arg[0];
        this.#_ServicesState ??= ServicesState;
        this.#_ServicesState.SetServiceObject(this.Name, this);
        this.#_Status = STATUS_ACTIVE;
        this.UpdateBusList();
    } 
    /**
     * @method
     * @description убирает службу из списка созданных 
     * @param {string} _topic 
     * @param {object} _msg 
     */
    HandlerEvents_all_close(_topic, _msg) {
        const index = ClassBaseService_S.#_InstancedNameList.indexOf(this.Name);

        if (index > -1) {
            ClassBaseService_S.#_InstancedNameList.splice(index, 1);
        }
        console.log(`${this.Name} | all-close`);
        // TODO: обращение к ServicesState
        this.#_EventOnList    = {}; // коллекция всех событий, которые слушает служба по шине (ключ - имя шины)
                                    // { имя_шины1: [ { topic1, on }, { topic2, on} ... ]}
        this.#_EventEmitList  = {}; // коллекция всех событий, которые направляются слушателю (ключ - имя слушателя)
        this.#_BusHandlerList = {}; // объект, хранящий агрегатные обработчики шин
        this.#_HandlerFunc = {}; // хранит значения типа 'топик события : функция обработчик'
        this.#_EmitFunc    = {}; // хранит значения типа 'топик события': функция-emit
        this.#_PromiseList = {}; // контейнер с промисами, привязанными к запросам
        this.#_ServicesState;    // объект служб
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
    EmitEvents_all_get_msg_nr(_topic, _data) {
        this.#_Node.send({ topic: _topic, payload: _data });
    }
    /**
     * @method
     * @public
     * @description Обновляет коллекцию используемых шин
     */
    UpdateBusList() {
        this.#_BusNameList.forEach(_busName => {
            this.#_BusList[_busName] ??= this.#_GlobalBusList[_busName];
            // this.#CreateBusHandler(this._BusList[_busName]);
        });
    }
    /**
     * @method
     * @description Инициализирует интерфейс для приема сообщений, пришедших от node-red узлов
     * @public
     * @param {*} _node
     */
    InitNR(_node) {
        this.#_Node = _node;
        this.#_BusList[NR_BUS_NAME] = new EventEmitter();
    }
    /**
     * @method
     * @public
     * @description Принимает сообщение, ранее полученное по Node-RED
     * @param {ClassBusMsg_S} _msg
     */
    ReceiveNR({ topic, payload }) {
        this.#_BusList[NR_BUS_NAME]?.emit(topic, payload);
    }
    /**
     * @typedef MsgOpts
     * @property {string} com
     * @property {[any]} [arg]
     * @property {[any]} [value]
     * @property {string} [hash]
     * @property {string} dest
     */
    /**
     * @method
     * @public
     * @description создает и возвращает объект сообщения
     * @description Создает объект класса BusMsg
     * @param {MsgOpts} _msgOpts
     * @returns
     */
    CreateMsg(_msgOpts) {
        try {
            // преобразование объекта сообщения
            _msgOpts.metadata.service = this.Name;
            return new ClassBusMsg_S(_msgOpts);
        } catch (e) {
            console.log(`BusMsg | ${e}`);
            return null;
        }
    }
    /**
     * @typedef EmitMsgOpts
     * @property {number} timeout - время в мс через которое промис разрешится со значением false
     */
    /**
     * @method
     * @public
     * @description Отправка сообщения на шину
     * @param {string} _busName 
     * @param {string} _topic 
     * @param {MsgOpts} _msg 
     * @param {EmitMsgOpts} _opts 
     * @returns 
     */
    async EmitMsg(_busName, _topic, _msg, _opts) {
        const bus = this.#_BusList[_busName];

        if (!bus) {
            console.log(`No bus with name ${_busName}`);
            return false;
        }
        const msg = this.CreateMsg(_msg);
        if (!msg) {
            console.log(`warn | unexpected msg format`);
            return;
        }
        // отправка через setImmediate чтобы перехват сообщения не произошел раньше чем return промиса
        setImmediate(() => bus.emit(_topic, msg));
        // если запрос требует ответ, то создается промис, который выполнится либо по таймауту либо при получении ответа
        if (msg.metadata.demandRes) {
            return this.#CreatePromise(msg, _opts);
        }
    }
    /**
     * @method
     * @private
     * @description Создает, сохраняет и возвращает промис, который разрешится либо при получении ответа (с результатом true) либо через заданный таймаут (false).
     * @param {string} _msgHash 
     * @param {EmitMsgOpts} _opts 
     * @returns 
     */
    #CreatePromise(_msgHash, _opts) {
        return new Promise((res, rej) => { 
            this.#_PromiseList[_msgHash] = { res, rej };      
            const timeout_ms = _opts.timeout ?? DFLT_SEND_TIMEOUT;
            const timeout = setTimeout(() => {
                res(false);
                delete this.#_PromiseList[_msgHash];
            }, timeout_ms);
        });
    }
}

module.exports = ClassBaseService_S;
