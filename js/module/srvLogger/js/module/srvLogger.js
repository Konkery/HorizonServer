/**
 * @class
 * Класс предоставляет инструменты для логирования 
 */
class ClassLogger {
    constructor(_LoggerBus) {
        this._Enabled = true;
        _LoggerBus.on('logInfo', (msg) => {
            this.Log(this.LogLevel.INFO, msg)
        });
        _LoggerBus.on('logDebug', (msg) => {
            this.Log(this.LogLevel.DEBUG, msg)
        });
        _LoggerBus.on('logWarn', (msg) => {
            this.Log(this.LogLevel.WARN, msg)
        });
        _LoggerBus.on('logError', (msg) => {
            this.Log(this.LogLevel.ERROR, msg)
        });
    }
    /**
     * @setter
     * @param {Boolean} flag 
     */
    set Enabled(flag) {
        if (typeof flag === 'boolean') {
            this._Enabled = flag;
            return true;
        }
        return false;    
    }
    /**
     * @getter
     * Объект с уровнями логов 
     */
    get LogLevel() {
        return ({
            INFO: 'INFO',
            DEBUG: 'DEBUG',
            ERROR: 'ERROR',
            WARN: 'WARN'
        });
    }
    GetSystemTime() {
        let date = new Date(); 
        let datetime = (date.getFullYear() + "-" + ("0" + (date.getMonth() + 1)).substr(-2) +
        "-" + ("0" + date.getDate()).substr(-2) + " " + ("0" + date.getHours()).substr(-2) +
        ":" + ("0" + date.getMinutes()).substr(-2) + ":" + ("0" + date.getSeconds()).substr(-2));

        return datetime;
    }
    Log(qlfier, msg) {
        if (!this._Enabled) return;
        
        // TODO: добавить запись в базу данных
        if (this.LogLevel[qlfier]) {
            console.log(`[${this.GetSystemTime()}] ${qlfier}>> ${msg}`);
            return true;
        }
        return false;
    }
}
module.exports = ClassLogger;