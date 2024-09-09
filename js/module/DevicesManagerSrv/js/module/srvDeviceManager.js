const { ClassChannelSensor, ClassSensorInfo } = require('srvChannelSensor');
const ClassBaseService_S = require('srvService');

/** КОНСТАНТЫ */
const EVENT_INIT = 'all-init';
const EVENT_REGISTER = 'register';
const EVENT_DM_READY = 'dm-ready';
const EVENT_DM_LIST_GET = 'dm-deviceslist-get';
const EVENT_DM_CREATED = 'dm-created';
const EVENT_CONNS_DONE = 'proc-connections-done';
const EVENT_PMQTT_SEND = 'pmqtt-send';
const EVENT_DM_NEW_CH = 'dm-new-ch';

const COM_DEVLIST_GET = 'dm-deviceslist-get';
const COM_SUB_SENS_ALL = 'dm-sub-sensorall';
const COM_PWSC_SEND = 'proxywsc-send';
const COM_PMQTT_SEND = 'proxymqtt-send';
const COM_PHUB_SEND = 'proxyhub-send';

const GET_INFO_TIMEOUT = 3000;

/********* списки топиков ******** */
const EVENT_ON_LIST_SYSBUS = ['dm-connections-done'];
const EVENT_ON_LIST_LHPBUS = ['dm-deviceslist-get'];
const EVENT_ON_LIST_HUBBUS = ['dm-deviceslist-get'];
/********************************* */

const BUS_NAMES_LIST = ['sysBus', 'logBus', 'lhpBus', 'hubBus'];

const getSendTopic = (_sourceType) => {
    return ({
        lhp: COM_PWSC_SEND,
        mqtt: COM_PMQTT_SEND,
        hub: COM_PHUB_SEND
    })[_sourceType];
}

/**
 * @class
 * Реализует функционал службы для работы с измерительными каналами подключенного контроллера. Обеспечивает создание виртуальных двойников измерительных каналов, обработку их показаний, а также отправку команд 
 */
class ClassDeviceManager extends ClassBaseService_S {
    #_SourcesState;
    #_GBusList;
    #_All_init1_msg;
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
    constructor({ _busList, _node }) {
        super({ _name: 'dm', _busNameList: BUS_NAMES_LIST, _busList, _node });
        this.#_GBusList = _busList;
        // Process передал список подключений, по которым будет выполнен запрос на получение списка каналов 
        this.FillEventOnList('sysBus', EVENT_ON_LIST_SYSBUS);
        this.FillEventOnList('lhpBus', EVENT_ON_LIST_LHPBUS);
        this.FillEventOnList('hubBus', EVENT_ON_LIST_HUBBUS);
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
     * @method
     * @description Сохраняет ссылки на используемые шины, информацию об источниках и инициализирует базовые обработчики
     * @param {InitOpts} arg - объект со ссылками на внешние зависимости 
     */
    async HandlerEvents_all_init1(_topic, _msg) {
        super.HandlerEvents_all_init1(_topic, _msg);
        const { SourcesState } = _msg.arg[0];
        this.#_SourcesState = SourcesState;
        this.#_All_init1_msg = _msg;
    }
    /**
     * @getter
     * @description обрабатывает поступление списка каналов: инициализирует каналы, рассылает подписку на обновления данных с контроллера и оповещает об этом си
     * @param {[string]} info - массив идентификаторов измерительных каналов в формате <article>-<sensId>-<sensCh>
     * @param {string} sourceName - идентификатор источника данных
     */
    async HandlerEvents_dm_devicelist_get(_topic, _msg) {
        const { sensor, actuator } = _msg.val[0];
        const source_name = _msg.arg;
        this.#CreateChannels(sensor, source_name);
        // соединение, с которого пришел ответ
        const conn = this.#_SourcesState._Collection.find(conn => conn.Name == source_name);   //TODO collection ли
        conn.CheckDM = true;
        // подписка на показания каналов
        const msg_to_plc = this.#CreateMsg_dm_sub_sensorall();
        this.EmitEvents_proxy_send({ value: msg_to_plc, arg: [source_name] })

        if (this.#_ResReceived === this.#_ReqSent)
            this.#ReadyCb();
    }

    /**
     * @method
     * @description Сохраняет информацию о источниках. Инициирует запросы на получение списка каналов 
     * @param {object} sourcesInfo - информация о источниках/подключениях
     * @returns 
     */
    async HandlerEvent_dm_connections_done(_topic, _msg) {
        if (this.#_GetInfoTimeout) {
            console.log(`DM | reqs are still processing`);
            return;
        }

        this.#_SourcesState._Collection
            .filter(conn => conn.IsConnected && !conn.CheckDM)
            .forEach(conn => {
                const msg_to_plc = this.#CreateMsg_dm_devicelist_get();
                this.EmitEvents_proxy_send({ value: msg_to_plc, arg: [conn.Name], demandRes: true });
            });
            console.log(`DM | req sent to ${conn.Name} total: ${++this.#_ReqSent}`);

        // завершение ожидания по таймауту
        this.#_GetInfoTimeout = setTimeout(this.#ReadyCb.bind(this), GET_INFO_TIMEOUT);
    };

    /** 
     * @method
     * @private
     * @description Завершает ожидание 'devicelist-get' и оповещает о имеющихся результатах 
     */
    #ReadyCb() {
        this._BusList.sysBus.emit(EVENT_DM_READY, {
            requests: this.#_ReqSent,
            responses: this.#_ResReceived
        });

        console.log(`DM | req: ${this.#_ReqSent} res: ${this.#_ResReceived}`);

        // Обновление кол-ва каналов от каждого подключения
        this.#UpdateSourceChCount();

        this.#_ReqSent = 0;
        this.#_ResReceived = 0;

        clearTimeout(this.#_GetInfoTimeout);
        this.#_GetInfoTimeout = null;
    }

    /**
     * @method
     * @private
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
     * @public
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
     * @description Создает каналы по спискам, полученным командой dm-devicelsit-get от источника
     * @param {[String]} _infoStrings - массив строк формата <article>-<sens_id>-<ch_num>
     * @param {String} _sourceName - идентификатор источника
     */
    #CreateChannels(_infoStrings, _sourceName, _sourceType) {
        _infoStrings.forEach(infoString => {
            const [article, deviceId, chNum] = infoString.split('-');
            this.#CreateCh({ article, deviceId, sourceId: _sourceName, chNum, sourceType: _sourceType });
        });
    }
    /**
     * @typedef ChOpts
     * @property {string} article
     * @property {string} deviceId
     * @property {string} sourceId
     * @property {number} chNum
     * @property {string} sourceType
     */
    /**
     * @method
     * @private
     * @description Создает и сохраняет объект канала датчика 
     * @param {ChOpts} param0 
     */
    #CreateCh({ article, deviceId, sourceId, chNum, sourceType: connType }) {
        // формирование id канала
        const ch_id = ClassChannelSensor.GetID(sourceId, deviceId, chNum);
        // получение/создание объекта SensorInfo
        if (!this.#_DeviceInfo.find(dev => dev.Article === article))
            this.#_DeviceInfo.push(this.#CreateDeviceInfo(article));     
        
        const device_info = this.#_DeviceInfo.find(dev => dev.Article === article);
        // получение конфига устройства
        const ch_config = this.GetChannelConfig(ch_id);

        const bus_name_list = ['sysBus', 'logBus', 'dataBus' `${connType}Bus`];

        const ch = new ClassChannelSensor({ 
            _busNameList: bus_name_list, 
            _busList: this.#_GBusList, 
            _id: ch_id, 
            _sensorInfo: device_info, 
            _config: ch_config 
        });
        ch.EmitEvents_all_init1('all-init1', this.#_All_init1_msg);
        
        console.log(`DM | Create ch ${ch.ID}`);
        this.#AddChannel(ch);
    }

    CreateStaticChannels(_channels) {
        _channels.forEach(ch => {
            // const { article, deviceId, sourceId, chNum, connType } = _ch;
            this.#CreateCh(ch);
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
     * @description Отправляет запрос на получение списка каналов
     * @param {object} _connectionId - идентификатор подключения
     */
    #CreateMsg_dm_devicelist_get({ arg }) {
        const msg_to_plc = { com: COM_DEVLIST_GET };
        return this.CreateMsg(msg_to_plc);
    }
    /**
     * @typedef EmitEventsOpts
     * @property {[any]} [value] - сообщение (команда)
     * @property {[string]} [arg] - подключение-адресат
     */
    /**
     * @method
     * @public
     * @description Отправляет сообщение value на источник arg[0] через прокси-службу, относящуюся к типу источника
     * @param {EmitEventsOpts} param0 
     * @returns 
     */
    EmitEvents_proxy_send({ value, arg }) {
        const source_name = arg[0];
        const source_type = this.#_SourcesState._Collection.find(_source => _source.Name === source_name).Type;
        const bus_name = `${source_type}Bus`;
        const com = getSendTopic(source_type);
        const msg = {
            com,
            arg,
            value,
            dest: 'proxywsc'
        }
        return this.EmitMsg(bus_name, com, msg);
    }
    /**
     * @method
     * @description Выполнение подписки на DM контроллера
     * @param {EmitEventsOpts} param0 
     */
    #CreateMsg_dm_sub({ arg }) {
        const msg_to_plc = { com: 'dm-sub', dest: 'dm' };
        return this.CreateMsg(msg_to_plc);
    }
    /**
     * @method
     * @description Отправляет подписку на обновление данных с контроллера по ws-соединению
     * @param {EmitEventsOpts} param0 
     */
    #CreateMsg_dm_sub_sensorall({ arg }) {
        const msg_to_plc = { com: COM_SUB_SENS_ALL, dest: 'dm' };
        return this.CreateMsg(msg_to_plc);
    }
    /**
     * @method
     * @description Вызов метода сенсора или актуатора
     * @param {EmitEventsOpts} param0 
     */
    #CreateMsg_dm_execute({ arg }) {
        // const [_chId, _methodName, ...args] = arg;

        const msg_to_plc = { com: 'dm-execute', arg, dest: 'dm' };
        return this.CreateMsg(msg_to_plc);
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
        return { Article: 'unknown' };
    }
    /**
     * @method
     * @description Обновляет кол-во каналов от каждого подключения
     */
    #UpdateSourceChCount() {
        this.#_SourcesState._Collection.forEach(conn => {
            conn.ChFactual = this.#_Channels.filter(ch => ch.SourceName === conn.ExpectName).length;
        });
    }
}

module.exports = ClassDeviceManager;
