const { ClassChannelSensor, ClassSensorInfo } = require('srvChannelSensor');
const ClassBaseService_S                      = require('srvService');
/** КОНСТАНТЫ */
const EVENT_INIT = 'all-init';
const EVENT_REGISTER = 'register';
const EVENT_DM_READY   = 'dm-ready';
const EVENT_DM_LIST_GET= 'dm-deviceslist-get';
const EVENT_PWSC_SEND  = 'pwsc-send';
const EVENT_DM_CREATED = 'dm-created';
const EVENT_CONNS_DONE = 'proc-connections-done';
const EVENT_PMQTT_SEND = 'pmqtt-send';
const EVENT_DM_NEW_CH  = 'dm-new-ch';

const COM_GET_DEVLIST  = 'dm-deviceslist-get';
const COM_SUB_SENS_ALL = 'dm-sub-sensorall';

const GET_INFO_TIMEOUT = 3000;

// new coms
const COM_INIT1 = 'init1';
const COM_DM_LIST_GET= 'deviceslist-get';


const BUS_NAMES_LIST = ['sysBus', 'logBus', 'lhpBus'];

/**
 * @class
 * Реализует функционал службы для работы с измерительными каналами подключенного контроллера. Обеспечивает создание виртуальных двойников измерительных каналов, обработку их показаний, а также отправку команд 
 */
class ClassDeviceManager extends ClassBaseService_S {
    #_SourcesState;
    #_DevicesInfo;
    #_Channels = [];
    #_DeviceInfo = [];              // список ClassSensorInfo
    #_GetInfoTimeout;               // таймер, который взводится при ожидании ответов на 'devicelist-get'

    #_ReqSent = 0;
    #_ResReceived = 0;                    
    /**
     * @constructor
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     */
    constructor({ busList, node }) { 
        super({ name: 'DeviceManager', busNamesList: BUS_NAMES_LIST, busList, node });
        // Process передал список подключений, по которым будет выполнен запрос на получение списка каналов 
        this._BusList.sysBus.on(EVENT_CONNS_DONE, this.#HandlerConnsDone.bind(this));
        // this.AddComHandler('sysBus', EVENT_CONNS_DONE, this.#HandlerConnsDone.bind(this));
        this._BusList.sysBus.on(EVENT_DM_LIST_GET, this.#HandlerDevListGet.bind(this));
        // this.AddComHandler('lhpBus', 'deviceslist-get', this.#HandlerDevListGet.bind(this));
    }

    /**
     * @getter
     * @description Массив каналов
     * @returns {[ClassChannelSensor]}
     */
    get SensorChannels() {
        return this.#_Channels.filter(ch => ch instanceof ClassChannelSensor);
    }
    /**
     * @getter
     * @description возвращает сводную таблицу инициализированных каналов
     * @returns {[ClassChannelSensor]}
     */
    get ChannelsList() {
        const list = {};
        this.SensorChannels.forEach(ch => {
            list[ch.ID] = { 
                article: ch.Info.Article, 
                name: ch.Info.Name, 
                chName: '' 
            };
        }, {});
        return list;
    }
    /**
     * @typedef InitOpts
     * @property {HrzBus} SystemBus
     * @property {object} SourcesInfo
     */
    /**
     * @method
     * @description Сохраняет ссылки на используемые шины, информацию об источниках и инициализирует базовые обработчики
     * @param {InitOpts} arg - объект со ссылками на внешние зависимости 
     */
    // async Init1Handler() { 
    //     super.
    // }

    /**
     * @getter
     * @description обрабатывает поступление списка каналов: инициализирует каналы, рассылает подписку на обновления данных с контроллера и оповещает об этом си
     * @param {[string]} info - массив идентификаторов измерительных каналов в формате <article>-<sensId>-<sensCh>
     * @param {string} sourceName - идентификатор источника данных
     */
    async #HandlerDevListGet(info, sourceName) {
        this.#CreateChsFromList(info, sourceName);
        // соединение, с которого пришел ответ
        const conn = this.#_SourcesState._collection.find(conn => conn.ExpectName == sourceName);
        conn.CheckProcess = true;
        // подписка на показания каналов
        this.SubSensAll(conn.ExpectName);

        if (this.#_ResReceived === this.#_ReqSent)
            this.ReadyCb();
    }

    /**
     * @method
     * @description Сохраняет информацию о источниках. Инициирует запросы на получение списка каналов 
     * @param {object} sourcesInfo - информация о источниках/подключениях
     * @returns 
     */
    async #HandlerConnsDone(sourcesState) {
        if (this.#_GetInfoTimeout) {
            console.log(`DM | reqs are still processing`);
            return;
        }
        this.#_SourcesState = sourcesState;

        this.#_SourcesState._collection
            .filter(conn => conn.IsConnected && (!conn.ChFactual || conn.ChFactual < conn.ChExpected))
            .forEach(conn => {
                this.ReqDevList(conn);
                /* future ver
                const req = await this.ReqDevList(conn);
                if (req) 
                    conn.CheckDM = true;
                */
                console.log(`DM | req sent to ${conn} total: ${++this.#_ReqSent}`);
        });
        
        // завершение ожидания по таймауту
        this.#_GetInfoTimeout = setTimeout(this.ReadyCb.bind(this), GET_INFO_TIMEOUT);
    };

    /** 
     * @method
     * @description Завершает ожидание 'devicelist-get' и оповещает о имеющихся результатах 
     */
    ReadyCb() {
        this._BusList.sysBus.emit(EVENT_DM_READY, { 
            requests: this.#_ReqSent,
            responses: this.#_ResReceived
        });

        console.log(`DM | ${EVENT_DM_READY}, req: ${this.#_ReqSent} res: ${this.#_ResReceived}`);
        
        // Обновление кол-ва каналов от каждого подключения
        this.#UpdateSourceStateChCount();

        this.#_ReqSent = 0; 
        this.#_ResReceived = 0;

        clearTimeout(this.#_GetInfoTimeout);
        this.#_GetInfoTimeout = null;
    }

    /**
     * @method
     * @description Добавляет канал в реестр
     * @param {Object} ch 
     */
    #AddChannel(ch) {
        if (this.IsIDUnique(ch.ID)) {
            this.#_Channels.push(ch);
        }
    }

    /**
     * @method
     * @param {string} id 
     * @description Возвращает устройство с соответствующим id
     * @returns 
     */
    GetChannel(id) {
        return this.#_Channels.find(ch => ch.ID === id);
    }

    /**
     * @method
     * @description Создает объект ClassSensorInfo
     * @param {string} _article 
     * @returns {ClassSensorInfo}
     */
    #CreateDeviceInfo(_article) {
        // TODO
        // Обращение в БД 
        return { _Article: _article };
    }

    /**
     * @method
     * @description Обрабатывает поступление списка каналов с одного источника
     * @param {[String]} _infoStrings - массив строк формата <article>-<sens_id>-<ch_num>
     * @param {String} _sourceId - идентификатор источника
     */
    #CreateChsFromList(_infoStrings, _sourceId) {
        _infoStrings.forEach(infoString => {
            const [ article, id, chNum ] = infoString.split('-');

            if (!this.#_DeviceInfo.find(dev => dev._Article === article))  
                this.#_DeviceInfo.push(this.#CreateDeviceInfo(article));      // добавление объекта info в коллекцию

            // TODO: в зависимости от info создавать либо канал сенсора либо актуатора
            const ch = this.#CreateChannelSensor(_sourceId, id, chNum, article);
            console.log(`DM | Create ch ${ch.ID}`);
            this.#AddChannel(ch);
        });
    }

    /**
     * @method
     * @description Проверяет ID сенсора/актуатора и возвращает булевое значение, указывающее можно ли этот ID использовать.
     * @param {string} _id 
     */
    IsIDUnique(_id) {
        return !Boolean(this.#_Channels.find(ch => ch.ID === _id));
    }

    /**
     * @method
     * @description Инициализирует канал датчика
     * @param {string} _sourceId - идентификатор источника (контроллера/виртуального датчика/брокера)
     * @param {string} _deviceID - идентификатор датчика на контроллере
     * @param {string} _chNum - номер канала датчика 
     * @param {string} _article - артикль датчика
     * @returns {ClassChannelSensor}
     */
    #CreateChannelSensor(_sourceId, _deviceID, _chNum, _article) {
        const chId = `${_sourceId}-${_deviceID}-${_chNum}`;
        const chConfig = this.GetChannelConfig(chId);
        const deviceInfo = this.#_DeviceInfo.find(dev => dev._Article === _article);
        const ch = new ClassChannelSensor(deviceInfo, { sourceId: _sourceId, deviceId: _deviceID, chNum: +_chNum }, chConfig);
        ch.Init({ sysBus: this._BusList.sysBus });

        this._BusList.sysBus.emit(EVENT_DM_NEW_CH, ch.ID);  // оповещать об инициализации может и сам канал
        return ch;
    }

    /**
     * @method
     * @description Отправляет запрос на получение списка каналов
     * @param {object} _connectionId - идентификатор подключения
     */
    ReqDevList(_connection) {
        _connection.ChExpected = 100;   //TODO: устанавливать статическое значение
        console.log(`DEBUG | send GET_DEVLIST req    conn: ${_connection}`);
        const command = { com: COM_GET_DEVLIST, arg: [ _connection.ExpectName] }; 
        if (_connection.Type == 'plc')
            this._BusList.sysBus.emit(EVENT_PWSC_SEND, { com: COM_GET_DEVLIST, arg: [] }, _connection.ExpectName);
            /* future ver
            this.#SendMsgLHP(command);
            */ 
        if (_connection.Type == 'broker')
            this._BusList.sysBus.emit(EVENT_PMQTT_SEND, { com: COM_GET_DEVLIST, arg: [] }, _connection.ExpectName);
    }

    /**
     * @method
     * @description Выполнение подписки на DM контроллера
     * @param {object} _connection - идентификатор соединения
     */
    Sub(_connection) {
        if (_connection.Type == 'plc')
            this._BusList.sysBus.emit(EVENT_PWSC_SEND, { com: 'dm-sub', arg: [] }, _connection.ExpectName);
            /* future ver
            const com = { com: 'dm-sub', arg: [_connection.ExpectName] };
            this.#SendMsgLHP(command);
            */
    }

    /**
     * @method
     * @description Отправляет подписку на обновление данных с контроллера по ws-соединению
     * @param {string} _sourceName 
     */
    SubSensAll(_sourceName) {
        /* future ver
        const command = { com: COM_SUB_SENS_ALL, arg: [_sourceName] };
        this.#SendMsgLHP(command);
        */
        this._BusList.sysBus.emit(EVENT_PWSC_SEND, { com: COM_SUB_SENS_ALL, arg: [] }, _sourceName);
    }

    /**
     * @method
     * @description Вызов метода сенсора или актуатора
     * @param {string} _id 
     * @param {string} _methodName 
     * @param  {...any} args 
     */
    Execute(_id, _methodName, ...args) {
        /* future ver
        const command = { com: 'dm-execute', arg: [_id, _methodName, ...args], destinations: ['dm'] };
        #SendMsgToLHP(data);
        */
        this._BusList.sysBus.emit(EVENT_PWSC_SEND, { com: 'dm-execute', arg: [_id, _methodName, ...args] });
    }
    
    /**
     * @method
     * Отправляет сообщение на источник типа lhp
     * @param {*} _command 
     */
    async #SendMsgLHP(_command, _type) {
        const msg = {
            topic: 'pwsc-send',
            payload: {
                type: _type,
                com: 'send',
                arg: [_command],
                destinations: ['pwsc']
            }
        }
        return this.SendMsg('lhpBus', msg);
    }
    

    /**
     * @method
     * @description Возвращает конфиг канала
     * @param {string} _id 
     * @returns 
     */
    GetChannelConfig(_id) {
        // TODO: обращение к БД
        // ProxyDB.GetConfig(_id);
        return { article: 'unknown' };
    }

    /**
     * @method
     * @description Обновляет кол-во каналов от каждого подключения
     */
    #UpdateSourceStateChCount() {
        this.#_SourcesState._collection.forEach(conn => {
            conn.ChFactual = this.#_Channels.filter(ch => ch.SourceName === conn.ExpectName).length;
        });
    }
}

module.exports = ClassDeviceManager;
