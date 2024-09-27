/** зависимости */
const { ClassBusMsg_S, constants: MSG_CONST } = require('srvBusMsg');
const ClassBus_S = require('srvBus');
// const ClassBus_S       = require('srvBus');
const { EventEmitter } = require('events');
/********************************* */

/** константы */
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
     * @property {[string]} busNameList - список имен используемых шин
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
     * @getter
     * @description геттер на список доступных шин.
     */
    get BusList() {
        return this.#_BusList;
    }

    /**
     * @method
     * @description Заполняет коллекцию имен топиков, на которые выполняется подписка, на каждую шину.
     * @param {string} _busName - имя шины, по которой получаем сообщение
     * @param {...string} _topicNames
     */
    FillEventOnList(_busName, _topicNames) {
        this.#_EventOnList[_busName] ??= [];
        _topicNames
            .filter(_topicName => !this.#_EventOnList[_busName].find(event => event.name === _topicName))
            .forEach(_topicName => {
                this.#_EventOnList[_busName].push({ name: _topicName, on: false });
            });
        
        // инициализация агрегатных обработчиков
        this.#AddHandlerEvents(_busName);
        // наполнение _HandleFunc ссылками на методы-обработчики переданных событий
        this.#PackHandlerFunc(_busName);
        const log_msg = `${this.Name} | ${_busName} | EventOnList topics: ${this.#_EventOnList[_busName].filter(e => e.on).map(e => e.name).join(', ')}`;
        this.EmitEvents_logger_log ({ level: 'I', msg: log_msg });
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
        this.#_EventEmitList[_serviceName].push(
            _topicNames.filter(topicName => !this.#_EventEmitList[_serviceName].find(event => event.name === topicName))
            .map(topicName => ({ name: topicName }))
        );
        // наполнение _EmitFunc ссылками на методы-эмиттеры
        this.#PackEmitFunc();
    }
    /**
     * @method
     * @public
     * @description Дополняет список имен шин, к которым подключается служба; 
     * Вызывает this.UpdateBusList() для попытки подтянуть новые шины в коллекцию класса 
     * @param {[string]} _busNameList - список имен шин
     */
    AddBusList(_busNameList) {
        _busNameList
        ?.filter(_busName => !this.#_BusNameList.includes(_busName))
        .forEach(_busName => {
            this.#_BusNameList.push(_busName);
        });
        this.UpdateBusList();
    }
    /**
     * @method
     * @public
     * @param {ClassBusMsg_S} _bus 
     */
    CreateBus(_bus) {
        if (this.Name === 'proc' && _bus instanceof ClassBus_S)
            this.#_GlobalBusList[_bus.Name] = _bus;
    }
    /**
     * @method
     * @private
     * @description Создает глобальный обработчик событий на шину по её имени.
     * @param {string} _busName 
     */
    #CreateBusHandler(_busName) {
        return ((_topic, _msg) => {
            try {
                const { type } = _msg.metadata; 
                // если получен ответ на запрос
                if (type === MSG_CONST.MSG_TYPE_RESPONSE) {
                    const { hash } = _msg.metadata;
                    // ищем в контейнере по хэшу
                    const resolve = this.#_PromiseList[hash];
                    if (resolve)
                        resolve(true);
                    else            // таймер ожидания истёк
                        return;     // обработчик не будет вызван
                }
            } catch (e) {
                this.EmitEvents_logger_log({ level: 'E', msg: `Error while processing msg ${_topic}` });
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
    #AddHandlerEvents(_busName) {
        const event_list = this.#_EventOnList[_busName]?.filter(event => !event.on);
        // перебор всех топиков внутри списков и установка обработчиков на них
        event_list?.forEach(_event => {
            const topic = _event.name;
            // обращение к агрегатному обработчику шины
            this.#_BusHandlerList[_busName] ??= this.#CreateBusHandler(_busName).bind(this);
            const busHandler = this.#_BusHandlerList[_busName];
            // подписка агрегатного обработчика на топик
            this.#_BusList[_busName]?.on(topic, _msg => busHandler(topic, _msg));
            _event.on = true;
        });
    }
    /**
     * @method
     * @private
     * @description сохраняет функции-обработчики в объект
     */
    #PackHandlerFunc(_busName) {
        const event_list = this.#_EventOnList[_busName];
        
        event_list.forEach(_event => {
            if (_event.on) {
                const topic = _event.name;
                // Формируем имя обработчика, заменяя '-' на '_'
                const handler_name = getEventHandlerName(topic);
                this.#_HandlerFunc[topic] ??= this[handler_name]?.bind(this);
            }
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
            const emitList = this.#_EmitFunc[_serviceName];
            // обработка списка эмиттеров каждой службы
            emitList?.forEach(_topic => {
                // Формируем имя эмиттера
                const emitName = getEventEmitName(_topic);
                this.#_EmitFunc[_topic] = this[emitName]?.bind(this);
            });
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
    /**
     * @method
     * @public
     * @description Отправляет сообщение по Node-RED связи.
     * @param {string} _topic 
     * @param {*} _data 
     */
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
     * @typedef TypeMsgOpts
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
     * @param {TypeMsgOpts} _msgOpts
     * @returns
     */
    CreateMsg(_msgOpts) {
        try {
            // преобразование объекта сообщения
            _msgOpts.source = this.Name;
            return new ClassBusMsg_S(_msgOpts);
        } catch (e) {
            this.EmitEvents_logger_log({ level: 'E', msg: `BusMsg | ${e}` });
            return null;
        }
    }
    /**
     * @typedef TypeLogOpts
     * @property {string} level
     * @property {string} msg
     * @property {Error} err
     */
    /**
     * @method
     * @public
     * @description Предназначен для отправки сообщений на логгер. В arg указывается уровень сообщения, а в value - сообщение 
     * @param {TypeLogOpts} param0 
     */
    EmitEvents_logger_log({ level, msg, obj }) {
        const argsValid = typeof level === 'string' && typeof msg === 'string';
        if (argsValid) {
            const bus_msg = {
                dest: 'logger',
                com: 'logger-log',
                arg: [level],
                value: [msg, obj]
            }
            this.EmitMsg('logBus', 'logger-log', bus_msg);
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
     * @param {TypeMsgOpts} _msg 
     * @param {EmitMsgOpts} _opts 
     * @returns 
     */
    async EmitMsg(_busName, _topic, _msg, _opts) {
        const bus = this.#_BusList[_busName];

        if (!bus) {
            this.EmitEvents_logger_log({ level: 'E', msg: `No bus with name ${_busName}` });
            return false;
        }
        const msg = this.CreateMsg(_msg);
        if (!msg) {
            this.EmitEvents_logger_log({ level: 'E', msg: `warn | unexpected msg format` });
            return;
        }
        // если запрос требует ответ, то создается промис, который выполнится либо по таймауту либо при получении ответа
        const promise = msg.metadata.demandRes ? this.#CreatePromise(msg.metadata.hash, _opts) : Promise.resolve(true);
        // отправка через setImmediate чтобы перехват сообщения не произошел раньше чем return промиса
        setImmediate(() => bus.emit(_topic, msg));
        return promise;
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
            // время, не позднее которого промис удет разрешен
            const timeout_ms = _opts?.timeout ?? DFLT_SEND_TIMEOUT;
            // запуск таймаута
            const timeout = setTimeout(() => {
                res(false);
                delete this.#_PromiseList[_msgHash];
            }, timeout_ms);
            // по хэшу присваивается функция, вызов которой разрешит промис и выключит таймаут
            this.#_PromiseList[_msgHash] = (_result) => {
                res(_result);
                clearTimeout(timeout);
                delete this.#_PromiseList[_msgHash];
            };
        });
    }
}

module.exports = ClassBaseService_S;
