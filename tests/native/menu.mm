#import <Cocoa/Cocoa.h>
#define CIMGUI_DEFINE_ENUMS_AND_STRUCTS
#include "cimgui.h"
#include "visualize.h"
#include <cstdio>
#include <stdexcept>

static void expect(bool value, const char *message) {
  if (!value) throw std::runtime_error(message ? message : "Native menu check failed");
}

int main() {
  @autoreleasepool {
    try {
      expect(pv_surface_open(1) == 0, pv_error());
      NSMenu *menu = NSApp.mainMenu.itemArray.firstObject.submenu;
      NSMenuItem *settings = [menu itemWithTitle:@"Settings…"];
      expect(settings && settings.enabled, "The application Settings menu is missing");
      expect([settings.keyEquivalent isEqualToString:@","] &&
          settings.keyEquivalentModifierMask == NSEventModifierFlagCommand,
          "Settings does not advertise Command-comma");
      expect([menu itemWithTitle:@"Preferences…"] == nil,
          "A duplicate disabled preferences item remains");
      [menu performActionForItemAtIndex:[menu indexOfItem:settings]];
      expect(pv_surface_command() == 1, "The menu did not deliver Settings");
      expect(pv_surface_command() == 0, "A menu command was consumed twice");
      NSEvent *event = [NSEvent keyEventWithType:NSEventTypeKeyDown
          location:NSZeroPoint modifierFlags:NSEventModifierFlagCommand
          timestamp:0 windowNumber:0 context:nil characters:@","
          charactersIgnoringModifiers:@"," isARepeat:NO keyCode:43];
      expect([NSApp.mainMenu performKeyEquivalent:event], "Command-comma was not dispatched");
      expect(pv_surface_command() == 1, "Command-comma did not open Settings");
      pv_surface_close();
      std::puts("{\"ok\":true,\"menu\":true,\"shortcut\":true}");
      return 0;
    } catch (const std::exception &error) {
      std::fprintf(stderr, "%s\n", error.what());
      pv_surface_close();
      return 1;
    }
  }
}
