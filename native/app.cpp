#include "visualize.h"
#include "gpu.hpp"
#include "imgui_impl_sdl3.h"
#include <algorithm>
#include <map>
#include <memory>

namespace {
std::string last_error, event_text;
std::unique_ptr<pv::Gpu> viewer_context;
Json viewer_state, viewer_event;
bool show_context = false;
char search[256]{};
// Dynamic glyphs and table layout need a second frame after content changes.
int pending_frames = 2;
uint64_t animate_until = 0;

bool holding_input() {
  if (SDL_GetMouseState(nullptr, nullptr)) return true;
  int count = 0;
  const bool *keys = SDL_GetKeyboardState(&count);
  return std::any_of(keys, keys + count, [](bool down) { return down; });
}

std::string file_url(const std::string &file) {
  std::string url = "file://";
  const char *hex = "0123456789ABCDEF";
  for (unsigned char c : file) {
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
        (c >= '0' && c <= '9') || c == '/' || c == '-' || c == '_' || c == '.' || c == '~') url += c;
    else { url += '%'; url += hex[c >> 4]; url += hex[c & 15]; }
  }
  return url;
}

int frame() {
  const bool animating = SDL_GetTicks() < animate_until || holding_input();
  const bool text_input = ImGui::GetIO().WantTextInput;
  bool redraw = pending_frames > 0 || animating || text_input;
  int timeout = 1000;
  if (pending_frames > 0) timeout = 0;
  else if (animating) timeout = 16;
  else if (text_input) timeout = 250;
  if (!redraw) {
    wgpuDevicePoll(viewer_context->device, false, nullptr);
    viewer_context->check();
  }
  SDL_Event event;
  if (SDL_WaitEventTimeout(&event, timeout)) {
    do {
      if (event.type == SDL_EVENT_POLL_SENTINEL) continue;
      ImGui_ImplSDL3_ProcessEvent(&event);
      if (event.type == SDL_EVENT_QUIT || event.type == SDL_EVENT_WINDOW_CLOSE_REQUESTED) return 0;
      redraw = true;
      pending_frames = 2;
      animate_until = SDL_GetTicks() + 500;
    } while (SDL_PollEvent(&event));
  }
  if (!redraw) return 1;
  if (pending_frames > 0) --pending_frames;
  const auto &entries = viewer_state.at("entries");
  const auto selected = viewer_state.value("selected", "");
  static const Json empty;
  const auto &doc = viewer_state.contains("document") ? viewer_state.at("document") : empty;
  const auto ui_error = viewer_state.value("error", "");
  viewer_context->begin(0, 0);
  auto size = ImGui::GetIO().DisplaySize;
  ImGui::SetNextWindowPos(ImVec2(0, 0));
  ImGui::SetNextWindowSize(size);
  ImGui::Begin("Visualize", nullptr, ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoSavedSettings);
  ImGui::BeginChild("library", ImVec2(244, 0), ImGuiChildFlags_Borders);
  pv::text("PROJECT", 12, pv::bold, pv::accent);
  pv::text("Visualize", 32, pv::bold);
  pv::text("Your artifact library", 15, nullptr, pv::muted);
  ImGui::Spacing();
  ImGui::SetNextItemWidth(-1);
  ImGui::InputTextWithHint("##find", "Find an artifact...", search, sizeof(search));
  ImGui::Spacing();
  std::map<std::string, std::map<std::string, const Json *>> groups;
  for (const auto &entry : entries) {
    auto project = entry["project"].get<std::string>(), artifact = entry["artifact"].get<std::string>();
    if (!groups[project].count(artifact)) groups[project][artifact] = &entry;
  }
  for (const auto &[project, artifacts] : groups) {
    if (!ImGui::CollapsingHeader(project.c_str(), ImGuiTreeNodeFlags_DefaultOpen)) continue;
    for (const auto &[artifact, entry] : artifacts) {
      auto title = entry->at("title").get<std::string>();
      if (*search && (project + " " + artifact + " " + title).find(search) == std::string::npos) continue;
      auto selected_entry = std::find_if(entries.begin(), entries.end(), [&](const Json &e) { return e["directory"] == selected; });
      bool active = selected_entry != entries.end() && selected_entry->at("project") == project && selected_entry->at("artifact") == artifact;
      auto label = title + "##" + project + "/" + artifact;
      if (ImGui::Selectable(label.c_str(), active)) {
        viewer_event = Json{{"selected", entry->at("directory")}, {"followLatest", true}};
      }
    }
  }
  if (entries.empty()) pv::text("Render an artifact with the CLI to start your library.", 16, nullptr, pv::muted);
  ImGui::EndChild();
  ImGui::SameLine();
  ImGui::BeginGroup();
  auto current = std::find_if(entries.begin(), entries.end(), [&](const Json &e) { return e["directory"] == selected; });
  if (current != entries.end()) {
    auto label = current->at("createdAt").get<std::string>();
    ImGui::SetNextItemWidth(235);
    if (ImGui::BeginCombo("##version", label.c_str())) {
      for (const auto &entry : entries) {
        if (entry["project"] != (*current)["project"] || entry["artifact"] != (*current)["artifact"]) continue;
        auto text = entry.at("createdAt").get<std::string>() + "##" + entry.at("version").get<std::string>();
        if (ImGui::Selectable(text.c_str(), entry["directory"] == selected)) {
          viewer_event = Json{{"selected", entry["directory"]}, {"followLatest", false}};
        }
      }
      ImGui::EndCombo();
    }
    ImGui::SameLine();
    if (ImGui::Button("Context")) show_context = !show_context;
    ImGui::SameLine();
    if (ImGui::Button("Copy PNG path")) ImGui::SetClipboardText((selected + "/snapshot.png").c_str());
    ImGui::SameLine();
    if (ImGui::Button("PDF")) SDL_OpenURL(file_url(selected + "/snapshot.pdf").c_str());
    if (!doc.is_null()) {
      float content_width = ImGui::GetContentRegionAvail().x - (show_context ? 324 : 0);
      ImGui::PushID(selected.c_str());
      ImGui::BeginChild("canvas", ImVec2(std::max(320.0f, content_width), 0), ImGuiChildFlags_Borders);
      pv::document_body(doc, false);
      ImGui::EndChild();
      ImGui::PopID();
      if (show_context) {
        ImGui::SameLine();
        ImGui::BeginChild("context", ImVec2(312, 0), ImGuiChildFlags_Borders);
        pv::text("Artifact context", 23, pv::bold);
        pv::text(current->at("project").get<std::string>() + " / " + current->at("artifact").get<std::string>(), 15, nullptr, pv::muted);
        pv::text(current->at("createdAt"), 15, nullptr, pv::muted);
        if (doc.contains("context")) {
          for (const auto &item : doc["context"].items()) {
            pv::text(item.key(), 16, pv::bold);
            pv::text(item.value().is_string() ? item.value().get<std::string>() : item.value().dump(2), 15);
          }
        } else pv::text("No additional context supplied.", 16, nullptr, pv::muted);
        ImGui::EndChild();
      }
    }
  } else {
    pv::text("A place for your ideas", 38, pv::bold);
    pv::text("Saved dashboards, documents and diagrams appear here.", 20, nullptr, pv::muted);
  }
  if (!ui_error.empty()) pv::text(ui_error, 16, nullptr, ImVec4(0.7f, 0.2f, 0.2f, 1));
  ImGui::EndGroup();
  ImGui::End();
  ImGui::Render();
  viewer_context->present();
  return 1;
}
}

extern "C" int pv_render(const char *document_json, const char *output, int width, int scale) {
  try {
    last_error.clear();
    if (width < 480 || width > 2560 || scale < 1 || scale > 2)
      throw std::runtime_error("Width must be 480..2560 and scale must be 1 or 2");
    const auto document = Json::parse(document_json);
    pv::Gpu context;
    context.init(false);
    int height = 0;
    // Tables and dynamic font metrics settle on the second layout pass.
    for (int pass = 0; pass < 2; ++pass) {
      context.begin(width, context.max_dimension / scale, scale);
      height = static_cast<int>(ceil(pv::document(document, width, context.max_dimension / scale, true)));
      ImGui::Render();
    }
    height = std::max(160, height);
    if (height * scale > context.max_dimension)
      throw std::runtime_error("Artifact is too tall to export at this scale; split it into smaller artifacts");
    context.begin(width, height, scale);
    pv::document(document, width, height, true);
    ImGui::Render();
    auto pixels = context.capture(width * scale, height * scale);
    pv::write_image(output, width * scale, height * scale, pixels);
    return height;
  } catch (const std::exception &error) {
    last_error = error.what();
    return -1;
  }
}

extern "C" int pv_viewer_start(void) {
  try {
    last_error.clear();
    viewer_context = std::make_unique<pv::Gpu>();
    viewer_context->init(true);
    viewer_state = Json{{"entries", Json::array()}};
    show_context = false;
    search[0] = '\0';
    pending_frames = 2;
    animate_until = 0;
    return 0;
  } catch (const std::exception &error) {
    last_error = error.what();
    viewer_context.reset();
    return -1;
  }
}

extern "C" int pv_viewer_update(const char *state_json) {
  try {
    last_error.clear();
    auto state = Json::parse(state_json);
    if (state.value("selected", "") != viewer_state.value("selected", "")) {
      if (viewer_context) viewer_context->clear_images();
      pv::clear_markdown_cache();
    }
    viewer_state = std::move(state);
    pending_frames = 2;
    return 0;
  } catch (const std::exception &error) { last_error = error.what(); return -1; }
}

extern "C" int pv_viewer_frame(void) {
  try {
    last_error.clear();
    viewer_event = Json();
    if (!viewer_context) throw std::runtime_error("The viewer is not open");
    int result = frame();
    event_text = viewer_event.is_null() ? "" : viewer_event.dump();
    return result;
  } catch (const std::exception &error) { last_error = error.what(); return -1; }
}

extern "C" const char *pv_viewer_event(void) { return event_text.empty() ? nullptr : event_text.c_str(); }
extern "C" void pv_viewer_close(void) { viewer_context.reset(); }
extern "C" const char *pv_error(void) { return last_error.empty() ? nullptr : last_error.c_str(); }
