module.exports = () => {

/**
 * @typedef SensorOptsType - объект с описательными характеристиками датчика и параметрами, необходимых для обеспечения работы датчика
 * @property {String} id
 * @property {String} article
 * @property {String} name
 * @property {String} type
 * @property {[String]} channelNames
 * @property {String} typeInSignal
 * @property {String} typeOutSignal
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
        this._Name         = _opts.name; 
        this._Article      = _opts.article;
        this._ModuleName   = _opts.moduleName;
        this._Type         = _opts.type;
        this._ChannelNames = _opts.channelNames;

        this.CheckProps();
    }
    get Name() { return this._Name; }
    get Article() { return this._Article; }
    /**
     * @method
     * Метод проверяет корректность полей объекта
     */
    CheckProps() {
        //#region функции которые можно вынести в утилитарный класс
        const isStringNonEmpty = (p) => typeof p === 'string' && p.length > 0;
        const isNumberPositive = (p) => typeof p === 'number' && p > 0;
        //#endregion

        if (!isStringNonEmpty(this._IdSource))          throw new Error(`Invalid _IdSource`);
        if (!isStringNonEmpty(this._Article))           throw new Error(`Invalid _Article`);
        if (!isStringNonEmpty(this._Name))              throw new Error(`Invalid _Name`);
        if (!isStringNonEmpty(this._Type))              throw new Error(`Invalid _Type`);
        if (!isNumberPositive(this._QuantityChannel))   throw new Error(`Invalid _QuantityChannel`);
    }
}

/**
 * @class
 * Класс, представляющий каждый отдельно взятый канал датчика.
 */
class ClassChannelSensor {
    #_SystemBus;

    #_ValueBuffer = {
        _depth : 1,
        _rawVal : undefined,
        _arr : [],
    
        push: function(_val) {
            this._rawVal = _val;
            while (this._arr.length >= this._depth) {
                this._arr.shift();
            }
            this._arr.push(_val);
        }
    };
    #_Value;
    #_Status;
    #_SourceId;
    #_DeviceID;
    #_ChNum;           //номер канала (начиная с 0)
    #_ChangeThreshold;

    #_SensorInfo = null;
    #_Transform   = null;
    #_Suppression = null;
    #_Filter = null;
    #_Alarms = null;
    /**
     * @constructor
     * @param {ClassSensorInfo} sensorInfo - ссылка на основной объект датчика
     * @param {Number} num - номер канала
     */
    constructor(sensorInfo, _opts, _config) {
        this.#_SensorInfo = sensorInfo;      //ссылка на объект физического датчика
        /** Основные поля */
        
        this.#_Value = 0;
        // TODO: обновление status по событиям
        this.#_Status = 1;
        this.#_SourceId = _opts.sourceId;
        this.#_DeviceID = _opts.deviceId;
        this.#_ChNum    = _opts.chNum;             //номер канала (начиная с 0)
        this.#_ChangeThreshold = 1;
        /** Флаги */
        this._DataUpdated = false;
        this._DataWasRead = false;
        this._TimeStamp;
        /****** */
        this.SetupConfig(_config);
    }
    get Info()        { return this.#_SensorInfo; }

    get Alarms()      { return this.#_Alarms; }

    get Suppression() { return this.#_Suppression; }

    get Transform()   { return this.#_Transform; }

    get Filter()      { return this.#_Filter; }

    /**
     * @getter
     * Возвращает уникальный идентификатор канала
     */
    get ID() { return `${this.#_SourceId}-${this.#_DeviceID}-${('0'+this.#_ChNum).slice(-2)}`; }

    get SourceName() { return this.#_SourceId; }
    
    /**
     * @getter
     * Возвращает статус измерительного канала: 0 - не опрашивается, 1 - опрашивается, 2 - в переходном процессе
     */
    get Status() {
        // return this._Sensor._ChStatus[this.#_ChNum];
        return this.#_Status;
    }

    set Status(_s) {
        if (typeof _s == 'number') this.#_Status = _s;
    }

    /**
     * @getter
     * Возвращает установленный для канала порог изменения - процент, на который должно измениться Value чтобы SM считал его новым.
     */
    get ChangeThreshold () { 
        return this.#_ChangeThreshold; 
    }

    /**
     * @getter
     * Возвращает значение канала, хранящееся в основном объекте
     */
    get Value() { // вых значение канала
        if (!this.Status) return undefined;

        this._DataUpdated = false;
        if (this._DataWasRead) return this.#_Value;

        this.#_Value = this.#_Filter.FilterArray(this.#_ValueBuffer._arr);
        this._DataWasRead = true;

        return this.#_Value;
    }

    /**
     * @setter
     * Добавляет значение в буфер   
     * @param {Number} _val 
     */
    set Value(_val) {
        let val = this.#_Suppression.SuppressValue(_val);
        val = this.#_Transform.TransformValue(val);
        this.#_ValueBuffer.push(val);

        this.#_SystemBus.emit(`${this.ID}-fine`, this.Value);

        this._DataUpdated = true;
        this._DataWasRead = false;

        if (this._Alarms) this._Alarms.CheckZone(this.Value);
    }

    /**
     * @setter
     * Сеттер который устанавливает вместимость кольцевого буфера
     * @param {Number} _cap 
    */
    set AvgCapacity(_cap) {
        if (_cap > 1)
            this.#_ValueBuffer._depth = _cap;
    }

    Init({ SystemBus }) {
        SystemBus.on(`${this.ID}-raw`, (val) => {
            // TODO: выполнить чтение из БД 
            // this.Value = ProxyDB.ReadChValue(this.ID);
            this.Value = val;
        });
    }

    SetupConfig(_config) {
        const config = _config ?? {};
        this.#_Transform   = new ClassTransform(config.transform);
        this.#_Suppression = new ClassSuppression(config.suppression);
        this.#_Filter = new ClassFilter();
        this._Alarms = null;
        this.AvgCapacity = config.capacity || 1;
    }

    /**
     * @method
     * Инициализирует ClassAlarms в полях объекта.  
     */ 
    EnableAlarms() {
        this._Alarms = new ClassAlarms(this);
    }

    /**
     * @method 
     * Очищает буфер. Фактически сбрасывает текущее значение канала. 
     */
    ClearBuffer() {
        while (this.#_ValueBuffer._arr.length > 0) this.#_ValueBuffer._arr.pop();
    }

    /**
     * @method
     * Метод предназначен для запуска циклического опроса определенного канала датчика с заданной периодичностью в мс. Переданное значение периода сверяется с минимально допустимым значением для данного канала и, при необходимости, корректируется, так как максимальная частота опроса зависит от характеристик датчика.
     * В датчиках, где считывание значений с нескольких каналов происходит неразрывно и одновременно, ведется только один циклический опрос, а повторный вызов метода Start() для конкретного канала лишь определяет, будет ли в процессе опроса обновляться значение данного канала.
     * Для датчиков, каналы которых не могут опрашиваться одновременно, реализация разных реакций на повторный вызов метода выполняется с помощью параметра _opts.
     * 
     * @param {Number} [_period] - период опроса в мс.
     * @param {Object} [_opts] - необязательный параметр, позволяющий передать дополнительные аргументы.
     * @returns {Boolean} 
     */
    Start(_period, _opts) {
        return this.#_SensorInfo.Start(this.#_ChNum, _period, _opts);
    }

    /**
     * @method
     * Метод предназначен для прекращения считывания значений с заданного канала. В случаях, когда значения данного канала считываются синхронно с другими, достаточно прекратить обновление данных.
     */
    Stop() { 
        return this.#_SensorInfo.Stop(this.#_ChNum); 
    }

    /**
     * @method
     * Метод предназначен для остановки опроса указанного канала и его последующего запуска с новой частотой. Возобновление должно касаться всех каналов, которые опрашивались до остановки.
     * @param {Number} _period - новый период опроса.
     */
    ChangeFreq(_period) { 
        return this.#_SensorInfo.ChangeFreq(this.#_ChNum, _period); 
    }

    /**
     * @method
     * Метод предназначен для конфигурации датчика.
     * @param {Object} [_opts] - объект с конфигурационными параметрами.
     */
    Configure(_opts) {
        return this.#_SensorInfo.Configure(this.#_ChNum, _opts);
    }

    /**
     * @method
     * Метод предназначен для предоставления дополнительных сведений об измерительном канале или физическом датчике.
     * @param {Object} _opts - параметры запроса информации.
     */
    GetInfo(_opts) { 
        return this.#_SensorInfo.GetInfo(this.#_ChNum, _opts); 
    }

    /**
     * @method
     * Метод предназначен для выполнения перезагрузки датчика.
     * @param {Object} _opts - параметры перезагрузки.  
     */
    Reset(_opts) { 
        return this.#_SensorInfo.Reset(this.#_ChNum, _opts); 
    }

    /**
     * @method
     * Метод предназначен для выполнения калибровки измерительного канала датчика
     * @param {Object} _opts - объект с конфигурационными параметрами
     */
    Calibrate(_opts) {
        return this.#_SensorInfo.Calibrate(this.#_ChNum, _opts);
    }

    /**
     * @method
     * Метод предназначен для установки значения повторяемости измерений.
     * @param {Number | String} _rep - значение повторяемости.
     */
    SetRepeatability(_rep) { 
        return this.#_SensorInfo.SetRepeatability(this.#_ChNum, _rep); 
    }

    /**
     * @method
     * Метод предназначен для установки точности измерений.
     * @param {Number | String} _pres - значение точности.
     */
    SetPrecision(_pres) { 
        return this.#_SensorInfo.SetPrecision(this.#_ChNum, _pres); 
    }
}
/**
 * @class
 * Класс реализует функционал для работы с функциями-фильтрами
 */
class ClassFilter {
    #_FilterFunc;
    constructor() {
        this.#_FilterFunc = (arr) => arr[arr.length-1];
    }
    /**
     * @method
     * Вызывает функцию-фильтр от переданного массива
     * @param {[Number]} arr 
     * @returns 
     */
    FilterArray(arr) {
        return this.#_FilterFunc(arr);
    }

    /**
     * @method
     * Устанавливает функцию-фильтр
     * @param {Function} _func 
     * @returns 
     */
    SetFunc(_func) {
        if (!_func) {        //если _func не определен, то устанавливается функция-фильтр по-умолчанию
            this.#_FilterFunc = (arr) => arr[arr.length-1];
            return true;
        }
        if (typeof _func !== 'function') throw new Error('Not a function');
        this.#_FilterFunc = _func;
        return true;
    }
}
/**
 * @class
 * Класс реализует функционал для обработки числовых значений по задаваемым ограничителям (лимитам) и функцией
 */
class ClassTransform {
    #_TransformFunc;
    constructor(_opts) {
        if (_opts)
            this.SetLinearFunc(_opts.k, _opts.b);
        else
            this.#_TransformFunc = (x) => x;
    }
    /**
     * @method
     * Задает функцию, которая будет трансформировать вх.значения.
     * @param {Function} _func 
     * @returns 
     */
    SetFunc(_func) {
        if (!_func) {
            this.#_TransformFunc = (x) => x;
            return true;
        }
        if (typeof _func !== 'function') return false;
        this.#_TransformFunc= _func;
        return true;
    }
    /**
     * @method
     * Устанавливает коэффициенты k и b трансформирующей линейной функции 
     * @param {Number} _k 
     * @param {Number} _b 
     */
    SetLinearFunc(_k, _b) {
        if (typeof _k !== 'number' || typeof _b !== 'number') throw new Error('k and b must be values');
        this.#_TransformFunc = (x) => _k * x + _b; 
        return true;
    } 
    /**
     * @method
     * Возвращает значение, преобразованное линейной функцией
     * @param {Number} val 
     * @returns 
     */
    TransformValue(val) {
        return this.#_TransformFunc(val);
    }
}
/**
 * @class
 * Класс реализует функционал супрессии вх. данных
 */
class ClassSuppression {
    constructor(_opts) {
        this._Low = -Infinity;
        this._High = Infinity;
        if (_opts)
            this.SetLim(_opts.low, _opts.high);  
    }
    /**
     * @method
     * Метод устанавливает границы супрессорной функции
     * @param {Number} _limLow 
     * @param {Number} _limHigh 
     */
    SetLim(_limLow, _limHigh) {
        if (typeof _limLow !== 'number' || typeof _limHigh !== 'number') throw new Error('Not a number');

        if (_limLow >= _limHigh) throw new Error('limLow value should be less than limHigh');
        this._Low = _limLow;
        this._High = _limHigh;
        return true;
    }
    /**
     * @method
     * Метод возвращает значение, прошедшее через супрессорную функцию
     * @param {Number} _val 
     * @returns {Number}
     */
    SuppressValue(_val) {
        return _val > this._High ? this._High 
             : _val < this._Low  ? this._Low
             : _val;
    }
}

const indexes = { redLow: 0, yelLow: 1, green: 2, yelHigh: 3, redHigh: 4 };

/**
 * @typedef ZonesOpts - Объект, задающий все либо несколько зон измерения а также их оповещения
 * @property {ZoneOpts} red - красная зона
 * @property {ZoneOpts} yellow - желтая зона
 * @property {GreenZoneOpts} green - зеленая зона
*/
/**
 * @typedef ZoneOpts - Объект, описывающий красную и желтую зоны измерения
 * @property {Number} limLow - нижняя граница
 * @property {Number} limHigh - верхняя граница
 * @property {Function} cbLow - аларм нижней зоны
 * @property {Function} cbHigh - аларм верхней зоны
*/
/**
 * @typedef GreenZoneOpts - Объект, описывающий зеленую зону измерения
 * @property {Function} cb
*/
/**
 * @class
 * Реализует функционал для работы с зонами и алармами 
 * Хранит в себе заданные границы алармов и соответствующие им колбэки.
 * Границы желтой и красной зон определяются вручную, а диапазон зеленой зоны фактически подстраивается под желтую (или красную если желтая не определена).
 * 
 */
class ClassAlarms {
    /**
     * @constructor
     * @param {ClassChannelSensor} _channel 
     */
    constructor(_channel) {
        this._Channel = _channel;   // ссылка на объект сенсора
        this.SetDefault();
    }
    /**
     * @method
     * Устанавливает значения полей класса по-умолчанию
     */
    SetDefault() {
        this._Zones = [];
        this._Callbacks = new Array(5).fill((ch, z) => {});
        this._CurrZone = 'green';
    }
    /**
     * @method
     * Устанавливает новый колбэк если он верно передан.
     * Метод не предназначен для вызова пользователем.
     * @param {Number} _ind 
     * @param {Function} _cb 
     * @returns 
     */
    SetCallback(_ind, _cb) {
        if (typeof _cb === 'function') {
            this._Callbacks[_ind] = _cb;
            return true;
        }
        return false;
    }
    /**
     * @method
     * Метод, который задает зоны измерения и их функции-обработчики
     * @param {ZonesOpts} _opts 
     */
    SetZones(_opts) {
        if (!_opts) return false;

        if (!this.CheckOpts(_opts)) return false;

        if (_opts.yellow) {
            this._Zones[indexes.yelLow]  = _opts.yellow.low;
            this._Zones[indexes.yelHigh] = _opts.yellow.high;
            this.SetCallback(indexes.yelLow,  _opts.yellow.cbLow);     
            this.SetCallback(indexes.yelHigh, _opts.yellow.cbHigh);
        }
        if (_opts.red) {
            this._Zones[indexes.redLow]  = _opts.red.low;
            this._Zones[indexes.redHigh] = _opts.red.high;
            this.SetCallback(indexes.redLow,  _opts.red.cbLow);
            this.SetCallback(indexes.redHigh, _opts.red.cbHigh);
        }
        if (_opts.green) {
            this.SetCallback(indexes.green, _opts.green.cb);
        }
    } 
    /**
     * @method
     * Проверяет корректность переданных настроек зон измерения и алармов
     * @param {ZonesOpts} opts 
     * @returns 
     */
    CheckOpts(opts) {
        let yellow = opts.yellow;
        let red = opts.red;

        if (yellow) {
            if (yellow.low >= yellow.high ||                            //если нижняя граница выше верхней
                yellow.cbLow  && typeof yellow.cbLow !== 'function' ||   //коллбэк передан но не является функцией
                yellow.cbHigh && typeof yellow.cbHigh !== 'function') return false;

            if (opts.red) {                         //если переданы настройки красной зоны, сравниваем с ними
                if (yellow.low < red.low || yellow.high > red.high) 
                    return false;
            }                                       //иначе сравниваем с текущими значениями
            else if (yellow.low < this._Zones[indexes.redLow] || yellow.high > this._Zones[indexes.redHigh]) 
                return false;
        }
        if (red) {
            if (red.low >= red.high ||                                  //если нижняя граница выше верхней
                red.cbLow  && typeof red.cbLow !== 'function' ||         //коллбэк передан но не является функцией
                red.cbHigh && typeof red.cbHigh !== 'function') return false;

            if (!yellow) {                          //если не переданы настройки желтой зоны, сравниваем с текущими
                if (opts.red.low > this._Zones[indexes.yelLow] || opts.red.high < this._Zones[indexes.yelHigh]) 
                    return false;
            }
        }
        return true;
    }
    /**
     * @method
     * Метод обновляет значение текущей зоны измерения по переданному значению и, если зона сменилась, вызывает её колбэк
     * @param {Number} val 
     */
    CheckZone(val) {
        let prevZone = this._CurrZone;
        this._CurrZone = val < this._Zones[indexes.redLow]  ? 'redLow'
                       : val > this._Zones[indexes.redHigh] ? 'redHigh'
                       : val < this._Zones[indexes.yelLow]  ? 'yelLow'
                       : val > this._Zones[indexes.yelHigh] ? 'yelHigh'
                       : 'green';

        if (prevZone !== this._CurrZone) {
            this._Callbacks[indexes[this._CurrZone]](this._Channel, prevZone);
        }
    }
}

return { ClassChannelSensor, ClassSensorInfo };

}