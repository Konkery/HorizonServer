const { ClassChannelSensor,   ClassSensorInfo   } = require('srvChannelSensor');
const { ClassChannelActuator, ClassActuatorInfo } = require('srvChannelActuator');
const ClassBaseService_S = require('srvService');

// # КОНСТАНТЫ

// ### ИМЕНА КОМАНД
const COM_DM_DEVLIST_GET  = 'dm-deviceslist-get';
const COM_DM_SUB_SENS_ALL = 'dm-sub-sensorall';
const COM_PWSC_SEND       = 'proxywsclient-send';
// 
const COM_PMQTTC_SEND        = 'proxymqttclient-send';
const COM_PMQTTC_DEVLIST_GET = 'proxymqttclient-deviceslist-get';
const COM_PMQTTC_DEVLIST_SET = 'proxymqttclient-deviceslist-set';
// 
const COM_PRPI_SEND        = 'proxyrpiclient-send';
const COM_PRPI_DEVLIST_GET = 'proxyrpiclient-deviceslist-get';
// 
const PMDB_SOURCE_GET   = 'providermdb-device-config-get';
const PMDB_CHANNELS_GET = 'providermdb-channels-get';

// ### ИМЕНА СЛУЖБ
const SERVICE_NAME_PWSC   = 'proxywsclient';
const SERVICE_NAME_PMQTTC = 'proxymqttclient';
const SERVICE_NAME_PRPI   = 'proxyrpiclient';

// ### ПРОЧЕЕ
const GET_INFO_TIMEOUT = 3000;
const BUS_NAMES_LIST = ['sysBus', 'logBus', 'lhpBus', 'mdbBus', 'dataBus', 'mqttBus', 'rpiBus'];

// ### СПИСКИ ТОПИКОВ
const EVENT_ON_LIST_SYSBUS = ['all-init-stage1-set', 'all-close', 'all-connections-done'];
const EVENT_ON_LIST_MDBBUS = ['dm-channels-set', 'dm-device-config-set'];
const EVENT_ON_LIST_LHPBUS = ['dm-deviceslist-set'];
const EVENT_ON_LIST_RPIBUS = ['dm-deviceslist-set'];

// ### СООБЩЕНИЯ
const MSG_DM_DEVLIST_GET    = { com: COM_DM_DEVLIST_GET,     dest: 'dm' };
const MSG_PRPI_DEVLIST_GET  = { com: COM_PRPI_DEVLIST_GET,   dest: SERVICE_NAME_PRPI,   demandRes: true };
const MSG_PMQTT_DEVLIST_GET = { com: COM_PMQTTC_DEVLIST_GET, dest: SERVICE_NAME_PMQTTC, demandRes: true };

/**
 * @class
 * Реализует функционал службы для работы с измерительными каналами подключенного контроллера. Обеспечивает создание виртуальных двойников измерительных каналов, обработку их показаний, а также отправку команд 
 */
class ClassDeviceManager_S extends ClassBaseService_S {
    #_DevicesInfo;
    #_Channels = [];
    #_DeviceInfoList = {};              // список ClassSensorInfo
    #_GetInfoTimeout;               // таймер, который взводится при ожидании ответов на 'devicelist-get'

    #_ReqSent = 0;
    #_ResReceived = 0;
    /**
     * @constructor
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     * @param {object} _node - объект узла Node-RED
     */
    constructor({ _busList, _node }) {
        super({ _name: 'dm', _busNameList: BUS_NAMES_LIST, _busList, _node });
        // Process передал список подключений, по которым будет выполнен запрос на получение списка каналов 
        this.FillEventOnList('sysBus', EVENT_ON_LIST_SYSBUS);
        this.FillEventOnList('mdbBus', EVENT_ON_LIST_MDBBUS);
        this.FillEventOnList('lhpBus', EVENT_ON_LIST_LHPBUS);
        this.FillEventOnList('rpiBus', EVENT_ON_LIST_RPIBUS);
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
    async HandlerEvents_all_init_stage1_set(_topic, _msg) {
        super.HandlerEvents_all_init_stage1_set(_topic, _msg);
        await this.EmitEvents_providermdb_device_config_get();
        this.EmitEvents_providermdb_channels_get();
    }
    /**
     * @getter
     * @description обрабатывает поступление списка каналов: инициализирует каналы, рассылает подписку на обновления данных с контроллера и оповещает об этом си
     * @param {string} _topic
     * @param {*} _msg 
     */
    async HandlerEvents_dm_deviceslist_set(_topic, _msg) {
        this.#_ResReceived++;
        const msg_lhp = _msg.value[0];
        // извлечение списка каналов
        const { sensor, actuator } = msg_lhp.value[0];
        const [ source_name ] = _msg.arg;
        if (sensor)
            this.#CreateChannelsFromDevlist(sensor, source_name, 'sensor');
        if (actuator)
            this.#CreateChannelsFromDevlist(actuator, source_name, 'actuator');
        this.EmitEvents_all_init_channels_set();
        // соединение, с которого пришел ответ
        const source = this.SourcesState._Collection.find(_source => _source.Name == source_name);   //TODO collection ли
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
        const source_type = this.SourcesState._Collection.find(_source => _source.Name === source_name)?.Protocol;
        // обход источников для рассылки запроса на получение списка каналов
        this.SourcesState._Collection
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
    /**
     * @method
     * @public
     * @description Обрабатывает получение списка каналов. 
     * @param {string} _topic 
     * @param {} _msg 
     */
    HandlerEvents_dm_channels_set(_topic, _msg) {
        const [ ch_list ] = _msg.value;

        this.CreateDeviceInfoFromConfig(device_info_list);
        this.CreateChannelsFromConfig(ch_list);
    }
    /**
     * @method
     * @public
     * @description Обрабатывает получение конфигурации устройств. 
     * @param {string} _topic 
     * @param {} _msg 
     */
    HandlerEvents_dm_device_config_set(_topic, _msg) {
        const [ device_info_list ] = _msg.value;

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
            const res  = await this.EmitEvents_proxywscient_send({ 
                value: [MSG_DM_DEVLIST_GET], arg: [_source.Name], 
                demandRes: true, resCom: COM_PMQTTC_DEVLIST_SET, opts: { timeout: 1000 } 
            });
            if (res) {
                // подписка на показания каналов
                const msg_to_plc = this.#CreateMsg_dm_sub_sensorall();
                this.EmitEvents_proxywscient_send({ value: [msg_to_plc], arg: [_source.Name] });
            } else {
                this.EmitEvents_logger_log({ level: 'WARN', msg: `Timeout awaiting for 'dm-deviceslist-get' from ${_source}`});
            }
        }
        if (_source.Protocol === 'mqtt') {
            this.EmitEvents_proxymqttclient_deviceslist_get();
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
        const source_prim_bus_name = this.SourcesState._Collection
            .find(source => source.Name === _chOpts.SourceName).PrimaryBus;
        const bus_name_list = ['sysBus', 'logBus', 'dataBus', source_prim_bus_name];
        const ClassChannel = _type === 'sensor' ? ClassChannelSensor 
                                                : ClassChannelActuator;
        try {
            // создание канала
            const ch = new ClassChannel({ _busNameList: bus_name_list, _busList: this.BusList }, _chOpts);
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
        this.EmitEvents_all_init_channels_set();
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
     * @description Отправляет запрос на получение списка измерительных устройств
     * @returns 
     */
    async EmitEvents_providermdb_device_config_get() {
        const msg = {
            dest: 'providermdb',
            demandRes: true,
            com: 'providermdb-device-config-get',
        }
        this.EmitMsg('mdbBus', msg.com, msg, { timeout: 500 });
    }
    /**
     * @method
     * @public
     * @description Отправляет запрос на получение списка каналов
     * @returns 
     */
    EmitEvents_providermdb_channels_get() {
        const msg = {
            dest: 'providermdb',
            demandRes: true,
            com: 'providermdb-channels-set'
        }
        return this.EmitMsg('mdbBus', msg.com, msg, { timeout: 500 });
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
    async EmitEvents_proxywscient_send({ value, arg, demandRes=false, resCom, opts }) {
        const msg = {
            com: COM_PWSC_SEND,
            arg,                            // source_name = arg[0]
            value,                          // передаваемое сообщение
            dest: SERVICE_NAME_PWSC,
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
    async EmitEvents_proxymqttclient_deviceslist_get() {
        return this.EmitMsg('mqttBus', MSG_PMQTT_DEVLIST_GET.com, MSG_PMQTT_DEVLIST_GET, { timeout: 500 });
    }
    /**
     * @method
     * @public
     * @description Отправляет запрос на получение списка каналов Hub
     * @param {EmitEventsOpts} param0 
     */
    async EmitEvents_proxyrpi_deviceslist_get() {
        return this.EmitMsg('rpiBus', MSG_PRPI_DEVLIST_GET.com, MSG_PRPI_DEVLIST_GET, { timeout: 500 });
    }
    /**
     * @method
     */
    EmitEvents_all_init_channels_set() {
        const msg = {
            dest: 'all',
            com: 'all-init-channels-set',
            arg: [ { SourcesState: this.SourcesState, ServicesState: this.ServicesState }]
        }
        this.EmitMsg('sysBus', msg.com, msg);
    }
    /**
     * @method
     * @description Отправляет запрос на получение списка каналов
     * @param {object} _connectionId - идентификатор подключения
     */
    #CreateMsg_dm_devicelist_get() {
        return { com: COM_DM_DEVLIST_GET };
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
        return { com: COM_DM_SUB_SENS_ALL, dest: 'dm' };
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
        this.SourcesState._Collection.forEach(_source => {
            _source.ChFactual = this.#_Channels.filter(ch => ch.SourceId === _source.Name).length;
        });
    }
}

module.exports = ClassDeviceManager_S;
