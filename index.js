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
    
    console.log('DEVICE MOVE INSTANTIATE');
    console.logJS(self.config);
    
    var devicesConfig = self.config.devices;
    _.each(devicesConfig,function(deviceId) {
        var device =  self.controller.devices.get(deviceId);

        console.log('ADD DEVICE:'+deviceId);
        console.logJS(device);
        
        // TODO Get Icon
        // TODO Get Name
        // TODO Hide
        
        self.devices[deviceId] = this.controller.devices.create({
            deviceId: "DeviceMove_" + self.id+'_'+deviceId,
            defaults: {
                metrics: {
                    title: self.config.title
                }
            },
            overlay: {
                deviceType: 'switchMultilevel',
                metrics: {
                    title: self.config.title
                }
            },
            handler: function(level, args) {
                self.moveDevice(deviceId,level)
            },
            moduleId: self.id
        });
    });
    
    // TODO init polling
};

DeviceMove.prototype.stop = function () {
    var self = this;
    DeviceMove.super_.prototype.stop.call(this);
    _.each(this.devices,function(deviceId,deviceObject){
        self.controller.devices.remove(deviceObject.id);
    });
    this.devices = {};
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

DeviceMove.prototype.moveDevice = function(devideId,level) {
    var vDev        = self.devices[deviceId];
    var oldLevel    = vDev.get("metrics:level");
    console.log("SET from "+oldLevel+' to '+level);
    //vDev.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/RandomDevice/icon_"+level+".png");
}


 