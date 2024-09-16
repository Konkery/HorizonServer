const { ClassChannelSensor, ClassSensorInfo } = require('./srvChannelSensor');
const ClassBaseService_S = require('./srvService');

/** КОНСТАНТЫ */
const COM_DEVLIST_GET = 'deviceslist-get';
const COM_SUB_SENS_ALL = 'dm-sub-sensorall';
const COM_PWSC_SEND = 'proxywsc-send';
const COM_PMQTT_SEND = 'proxymqtt-send';
const COM_PHUB_SEND = 'proxyhub-send';

const GET_INFO_TIMEOUT = 3000;

/********* списки топиков ******** */
const EVENT_ON_LIST_SYSBUS = ['all-connections-done'];
const EVENT_ON_LIST_LHPBUS = ['dm-deviceslist-get'];
const EVENT_ON_LIST_HUBBUS = ['dm-deviceslist-get'];
/********************************* */

const MSG_DM_DEVLIST_GET    = { com: `dm-${COM_DEVLIST_GET}`, dest: 'dm' };
const MSG_PHUB_DEVLIST_GET  = { com: `proxyhub-${COM_DEVLIST_GET}`, dest: 'proxyhub', demandRes: true };
const MSG_PMQTT_DEVLIST_GET = { com: `proxymqtt-${COM_DEVLIST_GET}`, dest: 'proxymqtt', demandRes: true };

const BUS_NAMES_LIST = ['sysBus', 'logBus', 'lhpBus', 'hubBus'];

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
    #_DeviceInfoList = [];              // список ClassSensorInfo
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
    async HandlerEvents_dm_deviceslist_get(_topic, _msg) {
        console.log(`dm | get deviceslist ${new Date().getTime()}`);
        const msg_lhp = _msg.value[0];
        const { sensor, actuator } = msg_lhp.value[0];
        const source_name = _msg.arg[0];
        this.#CreateChannelsFromDevlist(sensor, source_name);
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
        if (this.#_GetInfoTimeout) {
            console.log(`DM | reqs are still processing`);
            return;
        }

        this.#_SourcesState._Collection
            .filter(_source => _source.IsConnected && !_source.CheckDM)
            .forEach(async _source => {
                if (_source.Type === 'lhp') {
                    // отправка запроса с ожиданием ответа
                    const res  = await this.EmitEvents_proxywsc_send({ 
                        value: [MSG_DM_DEVLIST_GET], arg: [_source.Name], 
                        demandRes: true, resCom: 'dm-deviceslist-get', opts: { timeout: 1000 } 
                    });
                    if (res) {
                        // подписка на показания каналов
                        const msg_to_plc = this.#CreateMsg_dm_sub_sensorall();
                        this.EmitEvents_proxywsc_send({ value: [msg_to_plc], arg: [_source.Name] });
                    }
                }
                if (_source.Type === 'mqtt') {
                    this.EmitEvents_proxymqtt_deviceslist_get();
                }
                if (_source.Type === 'hub') {
                    this.EmitEvents_proxyhub_deviceslist_get();
                }
                this.EmitEvents_logger_log({ level: 'INFO', 
                    msg: `DM | req sent to ${_source.Name} total: ${++this.#_ReqSent}`});
                console.log(`DM | req sent to ${_source.Name} total: ${++this.#_ReqSent}`);
            });

        // завершение ожидания по таймауту
        this.#_GetInfoTimeout = setTimeout(this.#ReadyCb.bind(this), GET_INFO_TIMEOUT);
    };

    /** 
     * @method
     * @private
     * @description Завершает ожидание 'devicelist-get' и оповещает о имеющихся результатах 
     */
    #ReadyCb() {
        console.log(`DM | req: ${this.#_ReqSent} res: ${this.#_ResReceived}`);
        this.EmitEvents_logger_log({ level: 'INFO', 
            msg: `DM | req sent to ${_source.Name} total: ${++this.#_ReqSent}`
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
     * @description Создает объект ClassSensorInfo
     * @param {string} _article 
     * @returns {ClassSensorInfo}
     */
    #CreateDeviceInfo(_article) {
        // this.EmitEvents_providermdb_get_info();
        // TODO
        // Обращение в БД 
        return { Article: _article };
    }

    /**
     * @method
     * @description Создает каналы по спискам, полученным командой dm-devicelsit-get от источника
     * @param {[String]} _infoStrings - массив строк формата <article>-<sens_id>-<ch_num>
     * @param {String} _sourceName - идентификатор источника
     */
    #CreateChannelsFromDevlist(_infoStrings, _sourceName, _sourceType) {
        _infoStrings.forEach(infoString => {
            const [article, deviceId, chNum] = infoString.split('-');
            this.#CreateChannel({ article, deviceId, sourceId: _sourceName, chNum });
        });
    }
    /**
     * @typedef ChOpts
     * @property {string} article
     * @property {string} deviceId
     * @property {string} sourceId
     * @property {number} chNum
     */
    /**
     * @method
     * @private
     * @description Создает и сохраняет объект канала датчика 
     * @param {ChOpts} param0 
     */
    #CreateChannel({ article, deviceId, sourceId, chNum }) {
        // формирование id канала
        const ch_id = ClassChannelSensor.GetID(sourceId, deviceId, chNum);
        // получение/создание объекта SensorInfo
        let device_info = this.GetDeviceInfo(article);
        // получение конфига устройства
        const ch_config = this.GetChannelConfig(ch_id);

        const source_type = this.#_SourcesState._Collection.find(source => source.Name === sourceId).Type;
        const bus_name_list = ['sysBus', 'logBus', 'dataBus', `${source_type}Bus`];
        
        try {
            const ch = new ClassChannelSensor({ 
                _busNameList: bus_name_list, 
                _busList: this.#_GBusList, 
                _id: ch_id, 
                _deviceInfo: device_info, 
                _config: ch_config 
            });
            ch.HandlerEvents_all_init1('all-init1', this.#_All_init1_msg);
        
            this.#AddChannel(ch);
            this.EmitEvents_logger_log({ level: 'ERROR', msg: `Created ch ${ch_id} successfully!`});
            console.log(`DM | Create ch ${ch.ID}`);
        } catch (e) {
            this.EmitEvents_logger_log({ level: 'ERROR', msg: `Failed to create ch ${ch_id}`});
        }
        
    }
    GetDeviceInfo(_article) {
        return this.#_DeviceInfoList.find(dev => dev.Article === _article);
    }
    /**
     * @method
     * @public
     * @description Создает список каналов датчиков/актуаторов по списку, полученному из БД
     * @param {[ChOpts]} _channels 
     */
    CreateChannelsFromConfig(_channels) {
        _channels.forEach(ch => {
            // const { article, deviceId, sourceId, chNum } = _ch;
            this.#CreateChannel(ch);
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
    async EmitEvents_proxymqtt_deviceslist_get() {
        return this.EmitMsg('mqttHub', 'proxymqtt-deviceslist-get', MSG_PMQTT_DEVLIST_GET, { timeout: 10000 });
    }
    /**
     * @method
     * @public
     * @description Отправляет запрос на получение списка каналов Hub
     * @param {EmitEventsOpts} param0 
     */
    async EmitEvents_proxyhub_deviceslist_get() {
        return this.EmitMsg('hubBus', 'proxyhub-deviceslist-get', MSG_PHUB_DEVLIST_GET);
    }

    /**
     * @method
     * @description Отправляет запрос на получение списка каналов
     * @param {object} _connectionId - идентификатор подключения
     */
    #CreateMsg_dm_devicelist_get() {
        return msg_to_plc = { com: COM_DEVLIST_GET };
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
        return { Article: 'unknown' };
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
