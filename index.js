/*** DeviceMove Z-Way HA module *******************************************

Version: 1.0.0
(c) Maroš Kollár, 2015
-----------------------------------------------------------------------------
Author: maros@k-1.com <maros@k-1.com>
Description:
    This module checks weather updates via weatherundergound.com

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
    
    var devicesConfig = self.config.devices;
    _.each(devicesConfig,function(deviceId) {
        //deviceId
        zway.devices[deviceId].instances[I].SwitchBinary.Set(255);
        
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
            /*
            handler: function(command, args) {
                var level = command;
                if (level !== 'on') {
                    level = 'off';
                }
                this.set("metrics:level", level);
                this.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/RandomDevice/icon_"+level+".png");
            },
            */
            moduleId: self.id
        });
    });
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




 