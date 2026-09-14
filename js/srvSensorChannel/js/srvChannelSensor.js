const ClassChannel_S = require('../../srvChannel/js/srvChannel'); 

// ### ПОДПИСКИ
const COM_DATA_RAW_GET = 'all-data-raw-get';
const COM_ALL_DEVINFO_SET = 'all-device-config-set';
const COM_DM_DEVLIST_SET = 'dm-deviceslist-set';
const COM_DM_NEW_CH = 'dm-new-channel';
// EMITS
const COM_DATA_FINE_SET = 'all-data-fine-set';

const COM_CH_ALARM = 'all-ch-alarm';
const COM_ALL_INIT1 = 'all-init-stage1-set';

const COM_ALL_CH_STATUS_GET = 'all-ch-status-get';
const COM_ALL_CH_STATUS_SET = 'all-ch-status-set';

// ### ПРОЧЕЕ
const DEV_CONF_GET_TIMEOUT = 500;

const STATUS_ACTIVE = 'active';
const STATUS_INACTIVE = 'inactive';

const CONST_UNKNOWN = 'unknown';
const VALUE_TYPE_NUMBER = 'number';
const VALUE_TYPE_STRING = 'string';

const VIRTUAL_SOURCE_NAME = 'virtual';

const valIsEqual = (a, b, x) => {
    return Math.abs(a - b) <= Math.abs(a) * (x / 100);
};

/**
 * @typedef SensorOptsType 
 * @property {String} name
 * @property {String} article
 * @property {String} module
 * @property {string} description
 * @property {String} type
 * @property {[String]} channelNames
 * @property {[String]} channelMeasures
 */
/**
 * @class 
 * Самый "старший" предок в иерархии классов датчиков. 
 * В первую очередь собирает в себе самые базовые данные о датчике: переданные шину, пины и тд. Так же сохраняет его описательную характеристику: имя, тип вх. и вых. сигналов, типы шин которые можно использовать, количество каналов и тд.
 */
class ClassSensorInfo {
    /**
     * @constructor
     * @param {SensorOptsType} _opts - объект с описательными характеристиками датчика и параметрами, необходимых для обеспечения работы датчика
     */
    constructor(_opts) {
        this._Id = _opts.id;
        this._Name = _opts.name;
        this._Module = _opts.module;
        this._Description = _opts.description;
        this._Type = 'sensor';
        this._Article = _opts.article;
        this._QuantityChannel = _opts.quantityChannel;
        this._ChannelNames = _opts.channelNames;
        this._ChannelMeasures = _opts.channelMeasures;
    }

    get Name() { return this._Name; }

    get Article() { return this._Article; }

    get ChNames() { return this._ChannelNames; }

    get Description() { return this._Description; }

    get ChannelNames() { return this.ChannelNames; }

    get ChannelMeasures() { return this.ChannelMeasures; }

    /**
     * @method
     * Метод проверяет корректность полей объекта
     */
    CheckProps() {
        //#region функции которые можно вынести в утилитарный класс
        const isStringNonEmpty = (p) => typeof p === 'string' && p.length > 0;
        //#endregion

        if (!isStringNonEmpty(this._Article)) throw new Error(`Invalid _Article`);
        if (!isStringNonEmpty(this._Name)) throw new Error(`Invalid _Name`);
        if (!isStringNonEmpty(this._Type)) throw new Error(`Invalid _Type`);
    }
}

const COM_ALL_DATA_FINE_SET = 'all-data-fine-set';
const COM_ALL_DATA_FINE_GET = 'all-data-fine-get';
/**
 * @class
 * @description Класс, представляющий каждый отдельно взятый канал датчика в качестве службы фреймворка.
 */
class ClassChannelSensor extends ClassChannel_S {
    #_Value;
    #_ValueAvg;
    /**
     * @typedef TypeServiceOpts
     * @property {[ClassBus_S]} _busList
     * @property {[string]} _busNameList
     */
    /**
     * @typedef TypeChOpts
     * @property {string} sourceName, 
     * @property {string} deviceId 
     * @property {number} chNum
     */
    /**
     * @constructor 
     * @param {TypeServiceOpts} _serviceOpts 
     * @param {TypeChOpts} _chOpts 
     * @param {ClassSensorInfo} _deviceInfo 
     */
    constructor({ _busList, _busNameList, _advOpts }) {
        // имя службы идентично id канала
        // const service_name = `${_advOpts.SourceName}-${_advOpts.DeviceId}-${_advOpts.ChNum}`;
        // const service_name = _advOpts.Name ?? _advOpts.ChAlias;
        super({ _busNameList, _busList, _advOpts });

        /** Основные поля */
        this.#_Value = _advOpts?.Value;
        if (typeof this.#_Value === 'number') {
            this.Buffer.push(this.#_Value);
        }
        this.#_ValueAvg = _advOpts?.Value;
        this._Bypass = false;
        this._DataUpdated = false;
        this._DataWasRead = false;
        this._TimeStamp;
    }

    /**
     * @getter
     * Возвращает значение канала, хранящееся в основном объекте
     */
    get Value() { // вых значение канала
        // if (this.Status != STATUS_ACTIVE) return undefined;

        this._DataUpdated = false;
        this._DataWasRead = true;

        return this.#_Value;
    }

    get ValueAvg() {
        this._DataUpdated = false;
        this.#_ValueAvg = this._DataWasRead ? this.#_ValueAvg 
                       : this._Bypass || this.ValueType != VALUE_TYPE_NUMBER ? this.#_Value
                       : this.Buffer.Filter();
        this._DataWasRead = true;

        return this.#_ValueAvg;
    }

    /**
     * @setter
     * Добавляет значение в буфер   
     * @param {Number} _val 
     */
    set Value(_val) {
        // if (this.Status != STATUS_ACTIVE) return;
        let val = _val;
        // Нужно изъять поле 
        if (this.ValueKey) try {
            val = typeof _val == 'string' ? JSON.parse(_val)[this.ValueKey] : _val[this.ValueKey];
        } catch {
            this.EmitEvents_logger_log({ level: 'E', msg: `Failed to extract "${this.ValueKey}" from ${_val}`, obj: _val });
        }
        // Нужно обработать как число
        // учитываем что тут val может уже быть полем, извлеченным из _val 
        if (this.ValueType == VALUE_TYPE_NUMBER && !this._Bypass) {
            val = Number.parseFloat(val);
            let val_preproc = val;
            val = this.Suppression.SuppressValue(val);
            this._ValueSuppressed = val != val_preproc;
            val = this.Transform.TransformValue(val);
            if (typeof val != 'number') {
                val = val_preproc;
                this.EmitEvents_logger_log({ level: 'W', msg: `Failed to apply math transform to value ${_val}`, obj: this });
            } else {
                this.Buffer.push(val);
            }
            if (this.SavingValues.raw) 
                this.EmitEvents_providermdb_data_write({ arg: ['raw'], value: [val_preproc] });
        }
        const prevValue = this.#_Value;
        this.#_Value = val;
        if (!valIsEqual(prevValue, val, this.ChangeThreshold)) {
            this.EmitEvents_all_data_fine_set();
            
            if (this.SavingValues.fine) 
                this.EmitEvents_providermdb_data_write({ arg: ['fine'], value: [val] });
        }
        
        this._DataUpdated = true;
        this._DataWasRead = false;

        if (this.Alarms) this.Alarms.CheckZone(this.Value);
    }

    /**
     * @method
     * @public
     * @description Обработчик команды на инициализацию службы
     * @param {string} _topic 
     * @param {ClassBusMsg_S} _msg 
     */
    HandlerEvents_all_init_stage1_set(_topic, _msg) {
        super.HandlerEvents_all_init_stage1_set(_topic, _msg);
        const busName = this.SourceName == VIRTUAL_SOURCE_NAME ? 'dataBus' : this.ProtocolBusName;
        this.FillEventOnList(busName, [COM_DM_DEVLIST_SET, COM_DATA_RAW_GET]);

        this.FillEventOnList('dataBus', this.StateChName 
            ? [COM_ALL_DATA_FINE_SET, COM_ALL_DATA_FINE_GET] 
            : [COM_ALL_DATA_FINE_GET]);

        this.EmitEvents_dm_new_channel();
        this.EmitEvents_all_ch_new();
    }

    /**
     * @method
     * @public
     * @description Отправляет на dataBus сообщение со значением канала
     */
    EmitEvents_all_data_fine_set() {
        const msg = {
            dest: 'all',
            com: COM_ALL_DATA_FINE_SET,
            arg: [this.Name],
            value: [{
                Name: this.Name,
                Value: this.Value,
                ValueAvg: this.ValueAvg,
                ValueSuppressed: this._ValueSuppressed,
                ChName: this.ChName,
                ChAlias: this.ChAlias,
                ChMeas: this.ChMeas,
                CurrZone: this.Alarms?.CurrZone
            }]
        }
        this.EmitMsg('dataBus', msg.com, msg);
    }

    /**
     * @method
     * @public
     * @description 
     * @param {string} _topic 
     * @param {ClassBusMsg_S} _msg 
     */
    HandlerEvents_all_data_raw_get(_topic, _msg) {
        this.allDataRawGetEvent = Date.now();
        try {
            const [source_name] = _msg.arg;
            const [ch_name] = _msg.value[0].arg;
            // ВНИМАНИЕ: от lhp-источников ch_name придет в формате <device_id>-<ch_num> а не <source_name>-<device_id>-<ch_num>
            // console.log(`(${ch_name} === ${this.NamePLC} || ${ch_name} === ${this.Name}) && ${source_name} === ${this.#_SourceName})`);
            if ((ch_name === this.NamePLC || ch_name === this.Name) && source_name === this.SourceName) {
                this.allDataRawGetEvent = Date.now();
                const value = _msg.value[0]?.value[0];
                this.Value = value;
            }
        } catch (e) {
            this.EmitEvents_logger_log({ msg: `Error while processing data-daw msg`, level: 'E', obj: _msg });
        }
    }

    /**
     * @method
     * @description Вызывает команду изменения значения при обновление сенсорного state-канала. 
     * @param {string} _topic 
     * @param {*} _msg 
     */
    HandlerEvents_all_data_fine_set(_topic, _msg) {
        const [chName] = _msg.arg;
        if (chName == this.StateChName) {
            const [{ Value, ValueSuppressed }] = _msg.value;
            if (!ValueSuppressed)
                this.SetValue(Value);
        }
    }
    
    HandlerEvents_all_data_fine_get(_topic, _msg) {
        const [chName] = _msg.arg;
        if (chName == this.Name) {
            this.EmitEvents_all_data_fine_set();
        }
    }

    /**
     * @method
     * @public
     * @description Обрабатывает получение конфигурации устройств. 
     * @param {string} _topic 
     * @param {ClassBusMsg_S} _msg 
     */
    HandlerEvents_all_device_config_set(_topic, _msg) {
        const [device_info_list] = _msg.value;
        const device = device_info_list.find(_device => _device.id === this.DeviceIdHash);

        if (!device) {
            this.EmitEvents_logger_log({ level: 'W', msg: `DeviceInfo for ${this.DeviceIdHash} is not found`, obj: _msg });
            return;
        }
        
        try {
            this.DeviceInfo = new ClassSensorInfo(device);
        } catch (e) {
            this.EmitEvents_logger_log({ level: 'E', msg: 'Failed to create DeviceInfo obj', obj: device });
        }
    }
}

module.exports = ClassChannelSensor;

