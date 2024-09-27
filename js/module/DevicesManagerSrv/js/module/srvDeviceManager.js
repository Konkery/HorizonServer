const { ClassChannelSensor,   ClassSensorInfo   } = require('srvChannelSensor');
const { ClassChannelActuator, ClassActuatorInfo } = require('srvChannelActuator');
const ClassBaseService_S = require('srvService');

// # КОНСТАНТЫ
// ### ИМЕНА КОМАНД
const COM_DEVLIST_GET  = 'deviceslist-get';
const COM_SUB_SENS_ALL = 'dm-sub-sensorall';
const COM_PWSC_SEND    = 'proxywsc-send';
const COM_PMQTTC_SEND  = 'proxymqttc-send';
const COM_PRPI_SEND    = 'proxyrpi-send';

// ### ИМЕНА СЛУЖБ
const SERVICE_NAME_PWSC   = 'proxywsc';
const SERVICE_NAME_PMQTTC = 'proxymqttc';
const SERVICE_NAME_PRPI   = 'proxyrpi';

// ### ПРОЧЕЕ
const GET_INFO_TIMEOUT = 3000;

// ### СПИСКИ ТОПИКОВ
const EVENT_ON_LIST_SYSBUS = ['all-connections-done'];
const EVENT_ON_LIST_LHPBUS = ['dm-deviceslist-get'];
const EVENT_ON_LIST_HUBBUS = ['dm-deviceslist-get'];

// ### СООБЩЕНИЯ
const MSG_DM_DEVLIST_GET    = { com: `dm-${COM_DEVLIST_GET}`, dest: 'dm' };
const MSG_PHUB_DEVLIST_GET  = { com: `${SERVICE_NAME_PMQTTC}-${COM_DEVLIST_GET}`, dest: SERVICE_NAME_PRPI, demandRes: true };
const MSG_PMQTT_DEVLIST_GET = { com: `${SERVICE_NAME_PMQTTC}-${COM_DEVLIST_GET}`, dest: SERVICE_NAME_PMQTTC, demandRes: true };

/**
 * @class
 * Реализует функционал службы для работы с измерительными каналами подключенного контроллера. Обеспечивает создание виртуальных двойников измерительных каналов, обработку их показаний, а также отправку команд 
 */
class ClassDeviceManager_S extends ClassBaseService_S {
    #_SourcesState;
    #_GBusList;
    #_All_init1_msg;
    #_DevicesInfo;
    #_Channels = [];
    #_DeviceInfoList = {};              // список ClassSensorInfo
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
                article: ch.DeviceInfo.Article,
                name: ch.DeviceInfo.Name,
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
    async HandlerEvents_dm_deviceslist_get(_topic, _msg) {
        this.#_ResReceived++;
        const msg_lhp = _msg.value[0];
        // извлечение списка каналов
        const { sensor, actuator } = msg_lhp.value[0];
        const [ source_name ] = _msg.arg;
        if (sensor)
            this.#CreateChannelsFromDevlist(sensor, source_name, 'sensor');
        if (actuator)
            this.#CreateChannelsFromDevlist(actuator, source_name, 'actuator');
        // соединение, с которого пришел ответ
        const source = this.#_SourcesState._Collection.find(_source => _source.Name == source_name);   //TODO collection ли
        source.CheckDM = true;

        if (this.#_ResReceived === this.#_ReqSent)
            this.#ReadyCb();
    }

    /**
     * @method
     * @description Сохраняет информацию о источниках. Инициирует запросы на получение списка каналов 
     * @param {object} sourcesInfo - информация о источниках/подключениях
     * @returns 
     */
    async HandlerEvents_all_connections_done(_topic, _msg) {
        // получение Type источника
        const source_name = _msg.arg[0];
        const source_type = this.#_SourcesState._Collection.find(_source => _source.Name === source_name)?.Protocol;
        // обход источников для рассылки запроса на получение списка каналов
        this.#_SourcesState._Collection
            .filter(_source => _source.IsConnected && !_source.CheckDM)
            /*.filter(_source => _source.Type === source_type)*/
            .forEach(async _source => {
                this.#_ReqSent++;
                this.#SendDeviceListGet(_source);
                /* логгирование */
                const log_msg = `DM | req sent to ${_source.Name} total: ${this.#_ReqSent}`;
                this.EmitEvents_logger_log({ level: 'INFO', msg: log_msg });
                /************** */
            });

        // завершение ожидания по таймауту
        this.#_GetInfoTimeout = setTimeout(this.#ReadyCb.bind(this), GET_INFO_TIMEOUT);
    };
    EmitEvents_providermdb_get_channels() {
        const msg = {
            dest: 'providermdb',
            demandRes: true,
            resCom: 'dm-set-channels',
            com: 'providermdb-get-channels',
            arg: [],
            value: []
        }
        return this.EmitMsg('mdbBus', msg.com, msg, { timeout: 1000 });
    }
    /**
     * @method
     * @public
     * @description Обрабатывает получение списка каналов и устройств. 
     * @param {string} _topic 
     * @param {} _msg 
     */
    HandlerEvents_dm_set_channels(_topic, _msg) {
        const [ ch_list, device_info_list ] = _msg.value;

        this.CreateDeviceInfoFromConfig(device_info_list);
        this.CreateChannelsFromConfig(ch_list);
    }
    /**
     * @method
     * @private
     * @description Выполняет запрос на получение списка каналов источника в зависимости от его типа.
     * Для lhp источников выполняется отправка сообщения на plc через proxywsc, в остальных случаях - прямой запрос к прокси-службе, относящейся к источнику
     * @param {*} _source 
     */
    async #SendDeviceListGet(_source) {
        if (_source.Protocol === 'lhp') {
            // отправка запроса с ожиданием ответа
            const res  = await this.EmitEvents_proxywsc_send({ 
                value: [MSG_DM_DEVLIST_GET], arg: [_source.Name], 
                demandRes: true, resCom: 'dm-deviceslist-get', opts: { timeout: 1000 } 
            });
            if (res) {
                // подписка на показания каналов
                const msg_to_plc = this.#CreateMsg_dm_sub_sensorall();
                this.EmitEvents_proxywsc_send({ value: [msg_to_plc], arg: [_source.Name] });
            } else {
                this.EmitEvents_logger_log({ level: 'WARN', msg: `Timeout awaiting for 'dm-deviceslist-get' from ${_source}`});
            }
        }
        if (_source.Protocol === 'mqtt') {
            this.EmitEvents_proxymqttc_deviceslist_get();
        }
        if (_source.Protocol === 'rpi') {
            this.EmitEvents_proxyrpi_deviceslist_get();
        }
    }
    /** 
     * @method
     * @private
     * @description Завершает ожидание 'devicelist-get' и оповещает о имеющихся результатах 
     */
    #ReadyCb() {
        this.EmitEvents_logger_log({ level: 'INFO', 
            msg: `DM | req: ${this.#_ReqSent} res: ${this.#_ResReceived}`
        });

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
        if (this.IsIDAvailable(ch.ID)) {
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
     * @description Создает каналы по спискам, полученным командой dm-devicelsit-get от источника
     * @param {[String]} _infoStrings - массив строк формата <article>-<sens_id>-<ch_num>
     * @param {String} _sourceName - идентификатор источника
     */
    #CreateChannelsFromDevlist(_infoStrings, _sourceName, _type) {
        _infoStrings.forEach(infoString => {
            const [Article, DeviceId, ChNum] = infoString.split('-');
            this.#CreateChannel({ Article, DeviceId, SourceName: _sourceName, ChNum }, _type);
        });
    }
    /**
     * @typedef TypeDeviceOpts 
     * @property {String} name
     * @property {String} article
     * @property {String} moduleName
     * @property {String} type
     * @property {[String]} channelNames
     */
    /**
     * @typedef TypeChOpts
     * @property {string} Article
     * @property {string} DeviceId
     * @property {string} SourceName
     * @property {number} ChNum
     * @property {TypeDeviceOpts} deviceInfo
     */
    /**
     * @method
     * @private
     * @description Создает и сохраняет объект канала датчика 
     * @param {TypeChOpts} _chOpts - аргументы для инициализации канала
     * @param {string} _type - тип девайса  
     */
    #CreateChannel(_chOpts, _type) {
        const source_type = this.#_SourcesState._Collection.find(source => source.Name === _chOpts.SourceName).Protocol;
        const bus_name_list = ['sysBus', 'logBus', 'dataBus', `${source_type}Bus`];
        const ClassChannel = _type === 'sensor' ? ClassChannelSensor 
                                                : ClassChannelActuator;
        try {
            // создание канала
            const ch = new ClassChannel({ _busNameList: bus_name_list, _busList: this.#_GBusList }, _chOpts);
            // инициализация
            ch.HandlerEvents_all_init1('all-init1', this.#_All_init1_msg);
            // добавление канала в реестр dm
            this.#AddChannel(ch);
            // логирование 
            this.EmitEvents_logger_log({ level: 'INFO', msg: `Created ch ${ch.ID} successfully!`});
        } catch (e) {
            this.EmitEvents_logger_log({ level: 'ERROR', msg: `Failed to create ch`});
        }    
    }
    /**
     * @method
     * @public
     * @description Возвращает объект ChannelInfo/ActuatorInfo
     * @param {string} _article 
     * @returns 
     */
    GetDeviceInfo(_article) {
        return this.#_DeviceInfoList[_article];
    }
    /**
     * @method
     * @public
     * @description Создает список каналов датчиков/актуаторов по списку, полученному из БД
     * @param {[TypeChOpts]} _channelOptsList 
     */
    CreateChannelsFromConfig(_channelOptsList) {
        _channelOptsList.forEach(_chOpts => {
            const type = _chOpts.Type; 
            this.#CreateChannel(_chOpts, type);
        });
    }
    /**
     * @method
     * @public
     * @description Заполняет список DeviceInfo согласно данным, полученным от providerMdb
     * @param {[]} _deviceInfoList 
     */
    CreateDeviceInfoFromConfig(_deviceInfoList) {
        _deviceInfoList.forEach(_devInfoOpts => {
            const article = _devInfoOpts.Article;
            const type = _devInfoOpts.Type;
            this.#_DeviceInfoList[article] = type === 'sensor' ? new ClassSensorInfo(_devInfoOpts)
                                                               : new ClassActuatorInfo(_devInfoOpts);
        });
    }
    /**
     * @method
     * @description Проверяет ID сенсора/актуатора и возвращает булевое значение, указывающее можно ли этот ID использовать.
     * @param {string} _id 
     */
    IsIDAvailable(_id) {
        return !Boolean(this.#_Channels.find(ch => ch.ID === _id));
    }
    /**
     * @method
     * @public
     * @description Отправляет запрос на получение конфига измерительных устройств
     * @returns 
     */
    async EmitEvents_providermdb_get_device_config() {
        // const config = _msg.value[0];
        return { Article: 'unknown' };
    }
    /**
     * @typedef EmitEventsOpts
     * @property {[any]} [value] - сообщение (команда)
     * @property {[string]} [arg] - подключение-адресат
     * @property {boolean} [demandRes] - требуется ли ответ
     * @property {[string]} [resCom] - топик по которому придет ответ если demandRes == true
     */
    /**
     * @method
     * @public
     * @description Отправляет сообщение value на источник arg[0] через прокси-службу, относящуюся к типу источника
     * @param {EmitEventsOpts} param0 
     * @returns 
     */
    async EmitEvents_proxywsc_send({ value, arg, demandRes=false, resCom, opts }) {
        const msg = {
            com: 'proxywsc-send',
            arg,                            // source_name = arg[0]
            value,                          // передаваемое сообщение
            dest: 'proxywsc',
            demandRes: true,
            resCom
        }
        return this.EmitMsg('lhpBus', msg.com, msg, demandRes ? opts : undefined);
    }
    /**
     * @method
     * @public
     * @description Отправляет запрос на получение списка каналов mqtt-источника
     * @param {EmitEventsOpts} param0 
     */
    async EmitEvents_proxymqttc_deviceslist_get() {
        return this.EmitMsg('mqttBus', 'proxymqtt-deviceslist-get', MSG_PMQTT_DEVLIST_GET, { timeout: 10000 });
    }
    /**
     * @method
     * @public
     * @description Отправляет запрос на получение списка каналов Hub
     * @param {EmitEventsOpts} param0 
     */
    async EmitEvents_proxyrpi_deviceslist_get() {
        return this.EmitMsg('hubBus', 'proxyrpi-deviceslist-get', MSG_PHUB_DEVLIST_GET);
    }
    /**
     * @method
     * @description Отправляет запрос на получение списка каналов
     * @param {object} _connectionId - идентификатор подключения
     */
    #CreateMsg_dm_devicelist_get() {
        return { com: COM_DEVLIST_GET };
    }
    /**
     * @method
     * @description Выполнение подписки на DM контроллера
     * @param {EmitEventsOpts} param0 
     */
    #CreateMsg_dm_sub() {
        return { com: 'dm-sub', dest: 'dm' };
    }
    /**
     * @method
     * @description Отправляет подписку на обновление данных с контроллера по ws-соединению
     * @param {EmitEventsOpts} param0 
     */
    #CreateMsg_dm_sub_sensorall() {
        return { com: COM_SUB_SENS_ALL, dest: 'dm' };
    }
    /**
     * @method
     * @description Вызов метода сенсора или актуатора
     * @param {EmitEventsOpts} param0 
     */
    #CreateMsg_dm_execute({ arg }) {
        // const [_chId, _methodName, ...args] = arg;

        return { com: 'dm-execute', arg, dest: 'dm' };
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
        return { };
    }
    /**
     * @method
     * @description Обновляет кол-во каналов от каждого подключения
     */
    #UpdateSourceChCount() {
        this.#_SourcesState._Collection.forEach(_source => {
            _source.ChFactual = this.#_Channels.filter(ch => ch.SourceId === _source.Name).length;
        });
    }
}

module.exports = ClassDeviceManager_S;
