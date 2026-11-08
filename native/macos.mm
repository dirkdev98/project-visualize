#import <Cocoa/Cocoa.h>
#include <SDL3/SDL.h>
#include "macos.hpp"

namespace {
int pending_command = 0;
Uint32 command_event = 0;
NSMenuItem *settings_item;
NSMenuItem *settings_separator;
NSString *placeholder_title;
}

@interface PVApplicationCommands : NSObject
- (void)showSettings:(id)sender;
@end

@implementation PVApplicationCommands
- (void)showSettings:(id)sender {
  pending_command = 1;
  SDL_Event event{};
  event.type = command_event;
  SDL_PushEvent(&event);
}
@end

namespace {
PVApplicationCommands *commands;
}

namespace pv {
void activate_app() {
  [NSApp activateIgnoringOtherApps:YES];
}

void install_app_menu() {
  remove_app_menu();
  NSMenu *menu = NSApp.mainMenu.itemArray.firstObject.submenu;
  if (!menu) return;
  command_event = SDL_RegisterEvents(1);
  commands = [PVApplicationCommands new];
  for (NSMenuItem *item in menu.itemArray) {
    if ([item.keyEquivalent isEqualToString:@","] && item.action == nil) {
      settings_item = item;
      placeholder_title = item.title;
      break;
    }
  }
  if (!settings_item) {
    settings_item = [[NSMenuItem alloc] initWithTitle:@"Settings…"
        action:@selector(showSettings:) keyEquivalent:@","];
    NSInteger position = MIN(2, menu.numberOfItems);
    [menu insertItem:settings_item atIndex:position];
    settings_separator = [NSMenuItem separatorItem];
    [menu insertItem:settings_separator atIndex:position + 1];
  }
  settings_item.title = @"Settings…";
  settings_item.action = @selector(showSettings:);
  settings_item.enabled = YES;
  settings_item.keyEquivalentModifierMask = NSEventModifierFlagCommand;
  settings_item.target = commands;
}

void remove_app_menu() {
  if (placeholder_title) {
    settings_item.title = placeholder_title;
    settings_item.action = nil;
    settings_item.target = nil;
  } else [settings_item.menu removeItem:settings_item];
  [settings_separator.menu removeItem:settings_separator];
  settings_item = nil;
  settings_separator = nil;
  placeholder_title = nil;
  commands = nil;
  pending_command = 0;
}

int take_menu_command() {
  int command = pending_command;
  pending_command = 0;
  return command;
}
}
