#pragma once
#include "imgui.h"
#include "json"
#include <functional>
#include <string>
#include <unordered_map>
#include <vector>

using Json = nlohmann::json;

namespace pv {
inline const ImVec4 ink{0.12f, 0.17f, 0.23f, 1};
inline const ImVec4 muted{0.40f, 0.46f, 0.51f, 1};
inline const ImVec4 accent{0.00f, 0.43f, 0.38f, 1};
inline const ImVec4 paper{0.97f, 0.97f, 0.95f, 1};
inline const ImVec4 border{0.86f, 0.88f, 0.86f, 1};
extern ImFont *regular, *bold, *italic, *mono;
extern bool exporting_document;
void setup_style();
void text(const std::string &value, float size = 18, ImFont *font = nullptr,
          ImVec4 color = ink, float wrap = 0);
void markdown(const std::string &value, const Json &assets);
void block(const Json &value, const Json &assets, bool exporting);
float document(const Json &value, float width, float height, bool exporting);
void document_body(const Json &value, bool exporting);
std::string string_value(const Json &value);
}
