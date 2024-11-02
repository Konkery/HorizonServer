const ClassBaseService_S = require('srvService');

// # КОНСТАНТЫ

// ### ИМЕНА КОМАНД
const COM_DM_DEVLIST_GET  = 'dm-deviceslist-get';
const COM_DM_DEVLIST_SET  = 'dm-deviceslist-set';
const COM_DM_SUB_SENS_ALL = 'dm-sub-sensorall';
const COM_PWSC_SEND       = 'proxywsclient-send';
const COM_DM_NEW_CH       = 'dm-new-channel';
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
const CH_MAPPING_TIMEOUT = 5000;
const BUS_NAMES_LIST = ['sysBus', 'logBus', 'lhpBus', 'mdbBus', 'dataBus', 'mqttBus', 'rpiBus'];

// ### СПИСКИ ТОПИКОВ
const EVENT_ON_LIST_SYSBUS =  ['all-init-stage1-set', 'all-close', 'all-connections-done', COM_DM_NEW_CH];
const EVENT_ON_LIST_MDBBUS =  ['dm-channels-set', 'dm-device-config-set'];
const EVENT_ON_LIST_MQTTBUS = [ COM_DM_DEVLIST_SET ];
const EVENT_ON_LIST_LHPBUS =  [ COM_DM_DEVLIST_SET ];
const EVENT_ON_LIST_RPIBUS =  [ COM_DM_DEVLIST_SET ];

// ### СООБЩЕНИЯ
const MSG_DM_DEVLIST_GET    = { com: COM_DM_DEVLIST_GET,     dest: 'dm' };

/**
 * @class
 * Реализует функционал службы для работы с измерительными каналами подключенного контроллера. Обеспечивает создание виртуальных двойников измерительных каналов, обработку их показаний, а также отправку команд 
 */
class ClassDeviceManager_S extends ClassBaseService_S {
    #_Channels = [];
    /**
     * @constructor
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
    /* @constructor
     * @param {object} _node - объект узла Node-RED
     */
    constructor({ _busList, _node }) {
        super({ _name: 'dm', _busNameList: BUS_NAMES_LIST, _busList, _node });
        // Process передал список подключений, по которым будет выполнен запрос на получение списка каналов 
        this.FillEventOnList('sysBus', EVENT_ON_LIST_SYSBUS);
        this.FillEventOnList('mdbBus', EVENT_ON_LIST_MDBBUS);
        this.FillEventOnList('lhpBus', EVENT_ON_LIST_LHPBUS);
        this.FillEventOnList('rpiBus', EVENT_ON_LIST_RPIBUS);
        this.FillEventOnList('mqttBus', EVENT_ON_LIST_MQTTBUS);
    }
    /**
     * @getter
     * @description возвращает сводную таблицу инициализированных каналов
     * @returns {[ClassChannelSensor]}
     */
    get ChannelsList() {
        if (!this.ServicesState) return [];
        return Object.values(this.ServicesState)
                .filter(_service => _service.Importance === 'application')
                .filter(_service => _service?.Service?.ChType);
    }

    /**
     * @method
     * @public
     * @description Обрабатывает сообщение о создании службы-канала
     * @param {string} _topic 
     * @param {*} _msg 
     */
    HandlerEvents_dm_new_channel(_topic, _msg) {
        // _msg.value[0] - ссылка на объект службы
        this.#_Channels.push(_msg.value[0]);
    }

    /**
     * @getter
     * @description обрабатывает поступление списка каналов: инициализирует каналы, рассылает подписку на обновления данных с контроллера и оповещает об этом си
     * @param {string} _topic
     * @param {*} _msg 
     */
    async HandlerEvents_dm_deviceslist_set(_topic, _msg) {
        // сообщение обрабатывается только если оно было отправлено прокси-службой
        if (!_msg?.metadata?.source?.includes('proxy')) return;

        const [ inner_msg ] = _msg.value;
        // извлечение списка каналов
        const { sensor, actuator } = inner_msg.value[0];
        const [ source_name ] = _msg.arg;
        // источник, с которого пришел ответ
        const source = this.SourcesState[source_name];   
        source.SensorChFactual   =   sensor?.length ?? 0;
        source.ActuatorChFactual = actuator?.length ?? 0;
        source.CheckDM = true;

        this.EmitEvents_logger_log({ level: 'INFO', msg: `Deviceslist response received from ${source_name}`, obj: inner_msg.value });

        this.EmitEvents_sub_sensorall({ dest: _msg.metadata.source, arg: [source_name] });

        // переотправка сообщения чтобы его получили службы-каналы
        this.EmitEvents_dm_deviceslist_set(_msg);
        // проверка если все службы-каналы готовы к работе 
        // setTimeout должен гарантировать что проверка произойдет после того как службы-каналы отреагируют на это событие
        setTimeout(() => {
            if (this.AllChReady()) this.EmitEvents_process_channels_ready();
        }, 20);
    }
    /**
     * @method
     * @description Сохраняет информацию о источниках. Инициирует запросы на получение списка каналов 
     * @param {string} _topic
     * @param {ClassBusMsg_S} _msg  
     * @returns 
     */
    async HandlerEvents_all_connections_done(_topic, _msg) {
        // обход источников для рассылки запроса на получение списка каналов
        Object.values(this.SourcesState)
            .filter(_source => _source.IsConnected && !_source.CheckDM)
            .forEach(_source => {
                this.EmitEvents_proxy_deviceslist_get({ arg: [_source.Name ], opts: { timeout: 1000 } });
                // this.#SendDeviceListGet(_source);
                // логирование отправки запроса на получение списка каналов
                this.EmitEvents_logger_log({ level: 'INFO', msg: `Deviceslist request sent to ${_source.Name}` });
            });
    }
    /**
     * @method
     * @public
     * @description Перевозбуждает полученное сообщение со списком каналов
     * @param {*} param0 
     */
    EmitEvents_dm_deviceslist_set({ arg, value }) {
        const [ source_name ] = arg;
        const protocol = this.SourcesState[source_name].Protocol;
        // находим прокси службу по протоколу и берем её PrimaryBus
        const bus_name = Object.values(this.ServicesState)
            .find(_service => _service.Name.includes('proxy') && _service.Protocol === protocol).PrimaryBus;
        const msg = {
            dest: 'all',
            com: COM_DM_DEVLIST_SET,
            arg,
            value
        }
        this.EmitMsg(bus_name, msg.com, msg);
    }
    /**
     * @method
     * @private
     * @description Выполняет запрос на получение списка каналов источника в зависимости от его типа.
     * Для lhp источников выполняется отправка сообщения на plc через proxywsc, в остальных случаях - прямой запрос к прокси-службе, относящейся к источнику
     * @param {*} _source 
     */
    #SendDeviceListGet(_source) { 
        if (_source.Protocol === 'lhp') {
            this.EmitEvents_proxywsclient_send({ 
                value: [MSG_DM_DEVLIST_GET], 
                arg: [_source.Name], 
                demandRes: true, 
                resCom: COM_DM_DEVLIST_SET, 
                opts: { timeout: 1000 } 
            });
        } else {
            this.EmitEvents_proxy_deviceslist_get({ arg: [_source.Name ], opts: { timeout: 1000 }});
        }
    }
    /**
     * @method
     * @public
     * @description Проверяет что все службы-каналы имеют внетренний статус 'active'
     * @returns {Boolean}
     */
    AllChReady() {
        const active_ch_count = this.#_Channels.filter(_ch => _ch.Status === 'active').length;
        const all_ch_active = active_ch_count === this.#_Channels.length;
        return all_ch_active;
    }
    /**
     * @method
     * @public
     * @description Отправляет по sysBus сообщение о томЯ, что все службы-каналы  
     */
    EmitEvents_process_channels_ready() {
        const msg = {
            dest: 'process',
            com: 'process-channels-ready'
        }
        this.EmitMsg('sysBus', msg.com, msg);
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
    async EmitEvents_proxywsclient_send({ value, arg, demandRes=false, resCom, opts }) {
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
     * @description Отправляет запрос на подписку на указанные каналы источника.
     * @param {*} param0 
     */
    EmitEvents_sub_sensorall({ dest, arg }) {
        const [ source_name ] = arg;
        const ch_service_list = this.#_Channels.filter(_ch => _ch.SourceName === source_name);
        const { PrimaryBus: protocol_bus_name, Protocol: protocol } = this.ServicesState[dest];
        // Массивы типа [{ name, address}, ...] для каналов сенсоров и актуторов
        const sensor = ch_service_list
            .filter(_ch => _ch.ChType === 'sensor')
            .map(_ch => ({ name: _ch.Name, address: _ch.Address }));
        const actuator = ch_service_list
            .filter(_ch => _ch.ChType === 'actuator')
            .map(_ch => ({ name: _ch.Name, address: _ch.Address }));

        const msg = {
            dest,
            com: `${dest}-sub-sensorall`,
            arg: [source_name],
            value: [{ sensor, actuator }]
        }
        this.EmitEvents_logger_log({ msg: `sub-sensorall send to ${source_name}`, lvl: 'I' });

        this.EmitMsg(protocol_bus_name, msg.com, msg);
    }
    /**
     * @method
     * @public
     * @description Отправляет запрос на получение списка каналов mqtt-источника
     * @param {EmitEventsOpts} param0 
     */
    async EmitEvents_proxy_deviceslist_get({ arg, opts }) {
        const [ source_name ] = arg;
        const protocol = this.SourcesState[source_name].Protocol;
        const { PrimaryBus: bus_name, Name: proxy_name } = Object.values(this.ServicesState)
            .find(_service => _service.Name.includes('proxy') && _service.Protocol === protocol);
        const msg = { 
            dest: proxy_name,
            demandRes: true,
            com: `${proxy_name}-deviceslist-get`, 
            arg,    
        };
        return this.EmitMsg(bus_name, msg.com, msg, opts);
    }

    /**
     * @method
     * @public
     * @description Отправляет запрос на получение списка каналов Hub
     * @param {EmitEventsOpts} param0 
     */
    /*async EmitEvents_proxyrpiclient_deviceslist_get({ arg }) {
        const msg = { 
            dest: SERVICE_NAME_PRPI,
            demandRes: true,
            com: COM_PRPI_DEVLIST_GET, 
            arg,    
        };
        return this.EmitMsg('rpiBus', msg.com, msg, { timeout: 500 });
    }*/
    /**
     * @method
     * @description Вызов метода сенсора или актуатора
     * @param {EmitEventsOpts} param0 
     */
    #CreateMsg_dm_execute({ arg }) {
        // const [_chId, _methodName, ...args] = arg;

        return { com: 'dm-execute', arg, dest: 'dm' };
    }
}

module.exports = ClassDeviceManager_S;
