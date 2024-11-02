module.exports = {	
	/*
	ClassProcessSrv:require('../HorizonServer_raw/js/module/ProcessSrv/js/module/srvProcess.js'),
	ClassServices:require('../HorizonServer_raw/js/module/ProcessSrv/js/module/Services.js'),
	ClassWSClient:require('../HorizonServer_raw/js/module/WSClientSrv/js/module/srvWSClient.js'),
	events:require('events'),
	ws:require('ws'),
	ClassLogger:require('../HorizonServer_raw/js/module/LoggerSrv/js/module/srvLogger.js'),
	ClassChannelSensor:require('../HorizonServer_raw/js/module/ChannelSensorSrv/js/module/srvChannelSensor.js'),
	ClassDeviceManager:require('../HorizonServer_raw/js/module/DevicesManagerSrv/js/module/srvDeviceManager.js'),
	ClassProxyWS:require('../HorizonServer_raw/js/module/ProxyWSSrv/js/module/srvProxyWS.js'), */

	// зависимости для модуля srvProviderMDB
	ClassProviderMDB_S	: require('../HorizonServer/js/module/srvProviderDB/js/module/srvProviderMDB.js'),
	MongoClient			: require('mongodb').MongoClient // импорт модуля для работы с MongoDB
}