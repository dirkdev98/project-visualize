#include "gpu.hpp"
#include "implot.h"
#include <algorithm>
#include <array>
#include <cctype>
#include <cmath>
#include <numeric>

namespace pv {
ImFont *regular = nullptr, *bold = nullptr, *italic = nullptr, *mono = nullptr;
bool exporting_document = false;

void setup_style() {
  ImGuiIO &io = ImGui::GetIO();
  io.IniFilename = nullptr;
  io.LogFilename = nullptr;
  io.ConfigFlags |= ImGuiConfigFlags_NavEnableKeyboard;
  auto &style = ImGui::GetStyle();
  ImGui::StyleColorsLight();
  style.FontSizeBase = 18;
  style.WindowPadding = ImVec2(28, 28);
  style.FramePadding = ImVec2(10, 7);
  style.ItemSpacing = ImVec2(12, 12);
  style.CellPadding = ImVec2(12, 10);
  style.WindowBorderSize = 0;
  style.FrameRounding = 5;
  style.GrabRounding = 4;
  style.ScrollbarRounding = 4;
  style.Colors[ImGuiCol_Text] = ink;
  style.Colors[ImGuiCol_TextDisabled] = muted;
  style.Colors[ImGuiCol_WindowBg] = paper;
  style.Colors[ImGuiCol_ChildBg] = paper;
  style.Colors[ImGuiCol_Border] = border;
  style.Colors[ImGuiCol_FrameBg] = ImVec4(0.91f, 0.93f, 0.90f, 1);
  style.Colors[ImGuiCol_Header] = ImVec4(0.80f, 0.89f, 0.83f, 1);
  style.Colors[ImGuiCol_HeaderHovered] = ImVec4(0.84f, 0.91f, 0.86f, 1);
  style.Colors[ImGuiCol_HeaderActive] = ImVec4(0.72f, 0.85f, 0.77f, 1);
  style.Colors[ImGuiCol_Button] = ImVec4(0.86f, 0.91f, 0.86f, 1);
  style.Colors[ImGuiCol_ButtonHovered] = ImVec4(0.75f, 0.86f, 0.78f, 1);
  style.Colors[ImGuiCol_ButtonActive] = ImVec4(0.65f, 0.81f, 0.70f, 1);
  style.Colors[ImGuiCol_CheckMark] = accent;
  style.Colors[ImGuiCol_SliderGrab] = accent;
  style.Colors[ImGuiCol_PlotHistogram] = accent;
  style.Colors[ImGuiCol_TableHeaderBg] = ImVec4(0.90f, 0.93f, 0.89f, 1);
  style.Colors[ImGuiCol_TableRowBgAlt] = ImVec4(0.94f, 0.95f, 0.92f, 1);
  auto load = [&](const char *file) {
    auto font = io.Fonts->AddFontFromFileTTF(file, 18);
    if (!font) throw std::runtime_error(std::string("Cannot load system font: ") + file);
    return font;
  };
  regular = load("/System/Library/Fonts/Supplemental/Arial.ttf");
  bold = load("/System/Library/Fonts/Supplemental/Arial Bold.ttf");
  italic = load("/System/Library/Fonts/Supplemental/Arial Italic.ttf");
  mono = load("/System/Library/Fonts/Menlo.ttc");
  io.FontDefault = regular;
  ImPlot::StyleColorsLight();
  ImPlot::GetStyle().PlotBorderSize = 0;
  ImPlot::GetStyle().PlotPadding = ImVec2(12, 12);
  ImPlot::GetStyle().Colors[ImPlotCol_PlotBg] = ImVec4(1, 1, 1, 1);
  ImPlot::GetStyle().Colors[ImPlotCol_FrameBg] = ImVec4(1, 1, 1, 1);
}

void text(const std::string &value, float size, ImFont *font, ImVec4 color, float wrap) {
  ImGui::PushFont(font ? font : regular, size);
  ImGui::PushStyleColor(ImGuiCol_Text, color);
  if (wrap >= 0) ImGui::PushTextWrapPos(wrap == 0 ? 0 : ImGui::GetCursorPosX() + wrap);
  ImGui::TextUnformatted(value.c_str());
  if (wrap >= 0) ImGui::PopTextWrapPos();
  ImGui::PopStyleColor();
  ImGui::PopFont();
}

std::string string_value(const Json &value) {
  if (value.is_null()) return "";
  if (value.is_string()) return value.get<std::string>();
  return value.dump();
}

namespace {
ImVec4 tone(const std::string &value) {
  if (value == "negative") return ImVec4(0.69f, 0.22f, 0.20f, 1);
  if (value == "warning") return ImVec4(0.64f, 0.39f, 0.08f, 1);
  if (value == "positive") return accent;
  return muted;
}

void panel(const std::function<void()> &body, ImVec4 color = ImVec4(1, 1, 1, 1)) {
  ImGui::PushStyleVar(ImGuiStyleVar_CellPadding, ImVec2(20, 18));
  if (ImGui::BeginTable("panel", 1, ImGuiTableFlags_BordersOuter | ImGuiTableFlags_SizingStretchSame)) {
    ImGui::TableNextRow(); ImGui::TableNextColumn();
    ImGui::TableSetBgColor(ImGuiTableBgTarget_RowBg0, ImGui::ColorConvertFloat4ToU32(color));
    body();
    ImGui::EndTable();
  }
  ImGui::PopStyleVar();
}

std::string lower(std::string value) {
  for (auto &c : value) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return value;
}

void table(const Json &value, bool exporting) {
  const auto &columns = value.at("columns"), &rows = value.at("rows");
  static std::unordered_map<ImGuiID, std::array<char, 256>> searches;
  auto &search = searches[ImGui::GetID("search")];
  if (!exporting && rows.size() > 5) {
    ImGui::SetNextItemWidth(std::min(300.0f, ImGui::GetContentRegionAvail().x));
    ImGui::InputTextWithHint("##search", "Filter rows...", search.data(), search.size());
  }
  auto flags = ImGuiTableFlags_BordersInnerH | ImGuiTableFlags_RowBg | ImGuiTableFlags_SizingStretchSame;
  if (!exporting) flags |= ImGuiTableFlags_Sortable | ImGuiTableFlags_SortMulti;
  if (ImGui::BeginTable("data", columns.size(), flags)) {
    for (const auto &column : columns)
      ImGui::TableSetupColumn(column.at("label").get_ref<const std::string &>().c_str());
    ImGui::TableHeadersRow();
    std::vector<size_t> order(rows.size());
    std::iota(order.begin(), order.end(), 0);
    if (!exporting) {
      if (auto specs = ImGui::TableGetSortSpecs(); specs && specs->SpecsCount > 0) {
        std::stable_sort(order.begin(), order.end(), [&](size_t a, size_t b) {
          for (int i = 0; i < specs->SpecsCount; ++i) {
            auto &spec = specs->Specs[i];
            const auto key = columns[spec.ColumnIndex].at("key").get<std::string>();
            Json x = rows[a].value(key, Json()), y = rows[b].value(key, Json());
            int compare;
            if (x.is_number() && y.is_number()) compare = x.get<double>() < y.get<double>() ? -1 : x.get<double>() > y.get<double>() ? 1 : 0;
            else compare = string_value(x).compare(string_value(y));
            if (compare) return spec.SortDirection == ImGuiSortDirection_Ascending ? compare < 0 : compare > 0;
          }
          return false;
        });
      }
    }
    auto query = exporting ? "" : lower(search.data());
    for (auto index : order) {
      const auto &row = rows[index];
      if (!query.empty()) {
        std::string haystack;
        for (const auto &column : columns) haystack += string_value(row.value(column.at("key").get<std::string>(), Json())) + " ";
        if (lower(haystack).find(query) == std::string::npos) continue;
      }
      ImGui::TableNextRow();
      for (const auto &column : columns) {
        ImGui::TableNextColumn();
        text(string_value(row.value(column.at("key").get<std::string>(), Json())), 16);
      }
    }
    ImGui::EndTable();
  }
}

void chart(const Json &value, bool exporting) {
  const std::array<ImVec4, 6> colors{{accent, {0.84f, 0.43f, 0.25f, 1}, {0.30f, 0.46f, 0.74f, 1},
                                   {0.64f, 0.43f, 0.65f, 1}, {0.69f, 0.61f, 0.20f, 1}, {0.31f, 0.65f, 0.62f, 1}}};
  if (exporting) ImPlot::SetNextAxesToFit();
  ImPlotFlags flags = ImPlotFlags_NoTitle | ImPlotFlags_Crosshairs;
  if (exporting) flags |= ImPlotFlags_NoInputs | ImPlotFlags_NoMenus;
  if (ImPlot::BeginPlot("##chart", ImVec2(-1, value.value("height", 300.0f)), flags)) {
    auto xlabel = value.value("xLabel", ""), ylabel = value.value("yLabel", "");
    ImPlot::SetupAxes(xlabel.c_str(), ylabel.c_str());
    if (value.contains("labels")) {
      const auto labels = value.at("labels").get<std::vector<std::string>>();
      std::vector<const char *> ptrs;
      std::vector<double> positions;
      for (size_t i = 0; i < labels.size(); ++i) { ptrs.push_back(labels[i].c_str()); positions.push_back(i); }
      ImPlot::SetupAxisTicks(ImAxis_X1, positions.data(), positions.size(), ptrs.data());
      // SetupAxisTicks retains the labels only until the first plot item locks setup.
      ImPlot::SetupFinish();
    }
    const auto kind = value.at("kind").get<std::string>();
    const auto &series = value.at("series");
    for (size_t i = 0; i < series.size(); ++i) {
      auto y = series[i].at("values").get<std::vector<double>>();
      std::vector<double> x(y.size());
      std::iota(x.begin(), x.end(), 0);
      if (series[i].contains("x")) x = series[i].at("x").get<std::vector<double>>();
      auto name = series[i].at("name").get<std::string>();
      ImPlotSpec style;
      style.LineColor = style.FillColor = colors[i % colors.size()];
      style.LineWeight = 2.5f;
      if (kind == "bar") {
        double width = 0.8 / series.size();
        for (auto &position : x) position += (static_cast<double>(i) - (series.size() - 1) / 2.0) * width;
        ImPlot::PlotBars(name.c_str(), x.data(), y.data(), y.size(), width, style);
      } else if (kind == "scatter") {
        style.Marker = ImPlotMarker_Circle;
        style.MarkerSize = 4;
        ImPlot::PlotScatter(name.c_str(), x.data(), y.data(), y.size(), style);
      } else ImPlot::PlotLine(name.c_str(), x.data(), y.data(), y.size(), style);
      if (!exporting && ImPlot::IsPlotHovered()) {
        auto mouse = ImPlot::GetPlotMousePos();
        auto nearest = std::min_element(x.begin(), x.end(), [&](double a, double b) { return fabs(a - mouse.x) < fabs(b - mouse.x); });
        if (nearest != x.end()) {
          ImGui::BeginTooltip();
          text(name + ": " + string_value(y[nearest - x.begin()]), 16, nullptr, ink, -1);
          ImGui::EndTooltip();
        }
      }
    }
    ImPlot::EndPlot();
  }
}

void diagram(const Json &value, bool exporting) {
  const auto &nodes = value.at("nodes");
  float width = ImGui::GetContentRegionAvail().x, height = value.value("height", 320.0f);
  auto origin = ImGui::GetCursorScreenPos();
  auto draw = ImGui::GetWindowDrawList();
  float box_width = std::min(180.0f, width / 3.5f), box_height = 66;
  std::vector<ImVec2> positions;
  std::unordered_map<std::string, size_t> ids;
  for (size_t i = 0; i < nodes.size(); ++i) {
    int columns = std::min<size_t>(3, nodes.size()), rows = (nodes.size() + columns - 1) / columns;
    float x = nodes[i].value("x", columns == 1 ? 0.5f : (i % columns + 0.5f) / columns);
    float y = nodes[i].value("y", (i / columns + 0.5f) / rows);
    positions.emplace_back(origin.x + box_width / 2 + x * (width - box_width),
                           origin.y + box_height / 2 + y * (height - box_height));
    ids[nodes[i].at("id").get<std::string>()] = i;
  }
  for (const auto &edge : value.value("edges", Json::array())) {
    auto a = positions[ids.at(edge.at("from"))], b = positions[ids.at(edge.at("to"))];
    float dx = b.x - a.x, dy = b.y - a.y;
    if (fabs(dx) + fabs(dy) < 1) continue;
    float fraction = std::min(box_width / (2 * std::max(0.1f, fabsf(dx))), box_height / (2 * std::max(0.1f, fabsf(dy))));
    auto start = ImVec2(a.x + dx * fraction, a.y + dy * fraction);
    auto end = ImVec2(b.x - dx * fraction, b.y - dy * fraction);
    auto color = ImGui::ColorConvertFloat4ToU32(muted);
    draw->AddLine(start, end, color, 2);
    float angle = atan2f(dy, dx);
    draw->AddTriangleFilled(end, ImVec2(end.x - 10 * cosf(angle - 0.45f), end.y - 10 * sinf(angle - 0.45f)),
                           ImVec2(end.x - 10 * cosf(angle + 0.45f), end.y - 10 * sinf(angle + 0.45f)), color);
    if (edge.contains("label")) {
      auto label = edge.at("label").get<std::string>();
      auto size = ImGui::CalcTextSize(label.c_str());
      ImVec2 p((a.x + b.x - size.x) / 2, (a.y + b.y - size.y) / 2 - 4);
      draw->AddRectFilled(ImVec2(p.x - 4, p.y - 2), ImVec2(p.x + size.x + 4, p.y + size.y + 2), IM_COL32_WHITE);
      draw->AddText(p, color, label.c_str());
    }
  }
  for (size_t i = 0; i < nodes.size(); ++i) {
    auto center = positions[i];
    ImVec2 a(center.x - box_width / 2, center.y - box_height / 2), b(center.x + box_width / 2, center.y + box_height / 2);
    auto color = tone(nodes[i].value("tone", "positive"));
    draw->AddRectFilled(a, b, IM_COL32(239, 246, 238, 255), 8);
    draw->AddRect(a, b, ImGui::ColorConvertFloat4ToU32(color), 8, 0, 1.5);
    auto label = nodes[i].at("label").get<std::string>();
    ImGui::PushFont(bold, 17);
    auto size = ImGui::CalcTextSize(label.c_str(), nullptr, false, box_width - 16);
    draw->AddText(bold, 17, ImVec2(center.x - size.x / 2, center.y - size.y / 2),
                  ImGui::ColorConvertFloat4ToU32(ink), label.c_str(), nullptr, box_width - 16);
    ImGui::PopFont();
    if (!exporting) {
      ImGui::SetCursorScreenPos(a);
      ImGui::PushID(static_cast<int>(i));
      ImGui::InvisibleButton("node", ImVec2(box_width, box_height));
      if (ImGui::IsItemHovered() && nodes[i].contains("detail")) {
        ImGui::BeginTooltip();
        text(nodes[i].at("detail"), 17, nullptr, ink, 320);
        ImGui::EndTooltip();
      }
      ImGui::PopID();
    }
  }
  ImGui::SetCursorScreenPos(origin);
  ImGui::Dummy(ImVec2(width, height));
}
}

static void blocks(const Json &children, const Json &assets, bool exporting) {
  for (size_t i = 0; i < children.size(); ++i) {
    ImGui::PushID(static_cast<int>(i));
    block(children[i], assets, exporting);
    ImGui::PopID();
  }
}

void block(const Json &value, const Json &assets, bool exporting) {
  auto type = value.at("type").get<std::string>();
  ImGui::PushID("block");
  if (value.contains("title") && type != "callout" && type != "details" && type != "card")
    text(value.at("title"), 22, bold);
  if (type == "markdown") markdown(value.at("content"), assets);
  else if (type == "text") text(value.at("content"));
  else if (type == "divider") { ImGui::Spacing(); ImGui::Separator(); ImGui::Spacing(); }
  else if (type == "spacer") ImGui::Dummy(ImVec2(0, value.value("height", 12.0f)));
  else if (type == "metric") {
    panel([&] {
      text(value.at("label"), 15, bold, muted);
      text(string_value(value.at("value")), 36, bold);
      text(value.value("detail", ""), 15, nullptr, tone(value.value("tone", "neutral")));
    });
  } else if (type == "progress") {
    text(value.at("label"), 17, bold);
    ImGui::ProgressBar(value.at("value").get<float>(), ImVec2(-1, 14), "");
    if (value.contains("detail")) text(value.at("detail"), 15, nullptr, muted);
  } else if (type == "row" || type == "column") {
    const auto &children = value.at("children");
    if (type == "column" || ImGui::GetContentRegionAvail().x < 620) {
      blocks(children, assets, exporting);
    } else {
      ImGui::PushStyleVar(ImGuiStyleVar_CellPadding, ImVec2(8, 0));
      if (ImGui::BeginTable("row", children.size(), ImGuiTableFlags_SizingStretchSame)) {
        for (size_t i = 0; i < children.size(); ++i)
          ImGui::TableSetupColumn("", ImGuiTableColumnFlags_WidthStretch,
            value.contains("weights") ? value.at("weights")[i].get<float>() : 1);
        ImGui::TableNextRow();
        for (size_t i = 0; i < children.size(); ++i) {
          ImGui::TableNextColumn();
          ImGui::PushID(static_cast<int>(i));
          block(children[i], assets, exporting);
          ImGui::PopID();
        }
        ImGui::EndTable();
      }
      ImGui::PopStyleVar();
    }
  } else if (type == "card" || type == "callout") {
    ImVec4 background = type == "callout" ? ImVec4(0.91f, 0.95f, 0.89f, 1) : ImVec4(1, 1, 1, 1);
    panel([&] {
      if (value.contains("title")) text(value.at("title"), 21, bold,
                                type == "callout" ? tone(value.value("tone", "positive")) : ink);
      if (type == "callout") markdown(value.at("content"), assets);
      else blocks(value.at("children"), assets, exporting);
    }, background);
  } else if (type == "details") {
    if (exporting) {
      text(value.at("title"), 21, bold);
      blocks(value.at("children"), assets, exporting);
    } else if (ImGui::CollapsingHeader(value.at("title").get_ref<const std::string &>().c_str(), ImGuiTreeNodeFlags_DefaultOpen))
      blocks(value.at("children"), assets, exporting);
  } else if (type == "code") {
    panel([&] {
      if (value.contains("language")) text(value.at("language"), 13, bold, muted);
      if (!exporting) {
        if (ImGui::SmallButton("Copy code")) ImGui::SetClipboardText(value.at("content").get_ref<const std::string &>().c_str());
      }
      text(value.at("content"), 15, mono);
    }, ImVec4(0.92f, 0.94f, 0.91f, 1));
  } else if (type == "table") table(value, exporting);
  else if (type == "chart") chart(value, exporting);
  else if (type == "diagram") diagram(value, exporting);
  else if (type == "image") {
    auto &image = gpu->image(assets.at(value.at("asset").get<std::string>()));
    float width = std::min(ImGui::GetContentRegionAvail().x, static_cast<float>(image.width));
    ImGui::Image(static_cast<ImTextureID>(reinterpret_cast<intptr_t>(image.view)), ImVec2(width, width * image.height / image.width));
    if (value.contains("caption")) text(value.at("caption"), 15, nullptr, muted);
  }
  if (value.contains("caption") && type != "image") text(value.at("caption"), 15, nullptr, muted);
  ImGui::PopID();
}

void document_body(const Json &value, bool exporting) {
  exporting_document = exporting;
  text("PROJECT VISUALIZE  /  " + value.value("category", "ARTIFACT"), 13, bold, accent);
  text(value.at("title"), 38, bold);
  if (value.contains("subtitle")) text(value.at("subtitle"), 19, nullptr, muted);
  ImGui::Spacing();
  ImGui::Separator();
  ImGui::Spacing();
  const auto assets = value.value("assets", Json::object());
  blocks(value.at("body"), assets, exporting);
  ImGui::Spacing();
}

float document(const Json &value, float width, float height, bool exporting) {
  ImGui::SetNextWindowPos(ImVec2(0, 0));
  ImGui::SetNextWindowSize(ImVec2(width, height));
  ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(36, 32));
  ImGui::Begin("artifact", nullptr, ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoSavedSettings |
                                    ImGuiWindowFlags_NoScrollWithMouse | ImGuiWindowFlags_NoScrollbar);
  document_body(value, exporting);
  float used = ImGui::GetCursorPosY() + 32;
  ImGui::End();
  ImGui::PopStyleVar();
  return used;
}
}
