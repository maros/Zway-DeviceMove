/*** DeviceMove Z-Way HA module *******************************************

Version: 1.0.0
(c) Maroš Kollár, 2015
-----------------------------------------------------------------------------
Author: maros@k-1.com <maros@k-1.com>
Description:
    Move devices to specified position based on timing information

******************************************************************************/

function DeviceMove (id, controller) {
    // Call superconstructor first (AutomationModule)
    DeviceMove.super_.call(this, id, controller);
}

inherits(DeviceMove, AutomationModule);

_module = DeviceMove;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

DeviceMove.prototype.init = function (config) {
    DeviceMove.super_.prototype.init.call(this, config);
    var self = this;
    
    self.devices = {};
    self.callbacks = {};
    
    console.log('DEVICE MOVE INSTANTIATE');
    console.logJS(self.config);
    
    var devicesConfig = self.config.devices;
    _.each(devicesConfig,function(deviceId) {
        console.log('ADD DEVICE:'+deviceId);
        var device  = self.controller.devices.get(deviceId);
        
        console.logJS(device);
        
        
        var icon    = device.get('metrics:icon') || "blinds";
        
        //device.set('visibility',false);
        //{"creatorId":11,"deviceType":"switchMultilevel","h":-1669838591,"hasHistory":false,"id":"DummyDevice_11","location":0,"metrics":{"level":"1","title":"Dummy 11"},"permanently_hidden":false,"tags":[],"visibility":true,"updateTime":1438377648}
        
        self.devices[deviceId] = this.controller.devices.create({
            deviceId: "DeviceMove_" + self.id+'_'+deviceId,
            location: device.get('location'),
            tags: device.get('tags'),
            defaults: {
                metrics: {
                    title: device.get('metrics:title'),
                    icon: icon
                }
            },
            overlay: {
                deviceType: 'switchMultilevel',
                metrics: {
                    linked: deviceId
                }
            },
            handler: function(level, args) {
                self.moveDevice(deviceId,level)
            },
            //updateTime: device.get('updateTime'),
            moduleId: self.id
        });
        
        self.callbacks[deviceId] = _.bind(self.checkDevice,self,deviceId);
        device.on('change:metrics:level',self.callbacks[deviceId]);
        self.callbacks[deviceId]();
        
    });
    
    this.timer = setInterval(function() {
        self.pollDevice(self);
    }, 5*60*1000);
    
    //self.pollDevice();
};

DeviceMove.prototype.stop = function() {
    var self = this;
    DeviceMove.super_.prototype.stop.call(this);
    _.each(this.devices,function(deviceId,deviceObject){
        var device  = self.controller.devices.get(deviceId);
        self.controller.devices.remove(deviceObject.id);
        device.off('change:metrics:level',self.checkDevice);
    });
    _.each(this.callbacks,function(deviceId,callbackFunction) {
        var device  = self.controller.devices.get(deviceId);
        device.off('change:metrics:level',callbackFunction);
    });
    this.devices = {};
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

DeviceMove.prototype.moveDevice = function(deviceId,level) {
    var self        = this;
    var vDev        = self.devices[deviceId];
    var oldLevel    = vDev.get("metrics:level");
    console.log("SET from "+oldLevel+' to '+level);
    //vDev.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/RandomDevice/icon_"+level+".png");
};

DeviceMove.prototype.pollDevice = function() {
    var self = this;
    _.each(self.config.devices,function(deviceId) {
        var device =  self.controller.devices.get(deviceId);
        var updateTime = device.get('updateTime');
        //device.performCommand("update");
    });
};

DeviceMove.prototype.checkDevice = function(deviceId,event) {
    var self        = this;
    
    
    //self.devices[deviceId].set('metrics:level',device.set('metrics:level'));
};

 