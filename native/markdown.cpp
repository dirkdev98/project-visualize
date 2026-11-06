#include "gpu.hpp"
#include "md4c.h"
extern "C" {
#include "entity.h"
}
#include <cfloat>
#include <cmath>
#include <memory>

namespace pv {
namespace {
struct Node {
  int type;
  unsigned level = 1;
  std::string value, link;
  std::vector<std::unique_ptr<Node>> children;
  explicit Node(int type) : type(type) {}
};

struct Tree {
  Node root{-1};
  std::vector<Node *> stack{&root};
  Node *add(int type) {
    auto node = std::make_unique<Node>(type);
    auto ptr = node.get();
    stack.back()->children.push_back(std::move(node));
    return ptr;
  }
};

std::string utf8(unsigned code) {
  if (code == 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) code = 0xfffd;
  std::string out;
  if (code < 0x80) out += static_cast<char>(code);
  else if (code < 0x800) {
    out += static_cast<char>(0xc0 | (code >> 6));
    out += static_cast<char>(0x80 | (code & 63));
  } else if (code < 0x10000) {
    out += static_cast<char>(0xe0 | (code >> 12));
    out += static_cast<char>(0x80 | ((code >> 6) & 63));
    out += static_cast<char>(0x80 | (code & 63));
  } else {
    out += static_cast<char>(0xf0 | (code >> 18));
    out += static_cast<char>(0x80 | ((code >> 12) & 63));
    out += static_cast<char>(0x80 | ((code >> 6) & 63));
    out += static_cast<char>(0x80 | (code & 63));
  }
  return out;
}

std::unique_ptr<Tree> parse(const std::string &source) {
  auto tree = std::make_unique<Tree>();
  MD_PARSER parser{};
  parser.flags = MD_DIALECT_GITHUB | MD_FLAG_NOHTML;
  parser.enter_block = [](MD_BLOCKTYPE type, void *detail, void *user) {
    auto &tree = *static_cast<Tree *>(user);
    auto node = tree.add(type);
    if (type == MD_BLOCK_H) node->level = static_cast<MD_BLOCK_H_DETAIL *>(detail)->level;
    if (type == MD_BLOCK_OL) node->level = static_cast<MD_BLOCK_OL_DETAIL *>(detail)->start;
    if (type == MD_BLOCK_CODE) {
      auto lang = static_cast<MD_BLOCK_CODE_DETAIL *>(detail)->lang;
      node->link.assign(lang.text, lang.size);
    }
    if (type == MD_BLOCK_LI) {
      auto li = static_cast<MD_BLOCK_LI_DETAIL *>(detail);
      if (li->is_task) node->link = li->task_mark == ' ' ? "[ ]" : "[x]";
    }
    tree.stack.push_back(node);
    return 0;
  };
  parser.leave_block = [](MD_BLOCKTYPE, void *, void *user) {
    static_cast<Tree *>(user)->stack.pop_back(); return 0;
  };
  parser.enter_span = [](MD_SPANTYPE type, void *detail, void *user) {
    auto &tree = *static_cast<Tree *>(user);
    auto node = tree.add(100 + type);
    if (type == MD_SPAN_A) {
      auto href = static_cast<MD_SPAN_A_DETAIL *>(detail)->href;
      node->link.assign(href.text, href.size);
    }
    if (type == MD_SPAN_IMG) {
      auto src = static_cast<MD_SPAN_IMG_DETAIL *>(detail)->src;
      node->link.assign(src.text, src.size);
    }
    tree.stack.push_back(node);
    return 0;
  };
  parser.leave_span = [](MD_SPANTYPE, void *, void *user) {
    static_cast<Tree *>(user)->stack.pop_back(); return 0;
  };
  parser.text = [](MD_TEXTTYPE type, const MD_CHAR *data, MD_SIZE size, void *user) {
    auto node = static_cast<Tree *>(user)->add(200);
    node->value.assign(data, size);
    if (type == MD_TEXT_BR) node->value = "\n";
    if (type == MD_TEXT_SOFTBR) node->value = " ";
    if (type == MD_TEXT_NULLCHAR) node->value = utf8(0xfffd);
    if (type == MD_TEXT_ENTITY) {
      if (auto entity = entity_lookup(data, size)) {
        node->value = utf8(entity->codepoints[0]);
        if (entity->codepoints[1]) node->value += utf8(entity->codepoints[1]);
      } else if (size > 3 && data[1] == '#') {
        auto number = node->value.substr(2, size - 3);
        bool hex = number[0] == 'x' || number[0] == 'X';
        node->value = utf8(strtoul(number.c_str() + (hex ? 1 : 0), nullptr, hex ? 16 : 10));
      }
    }
    return 0;
  };
  if (md_parse(source.data(), source.size(), &parser, tree.get()) != 0)
    throw std::runtime_error("Cannot parse rich text");
  return tree;
}

struct Run {
  std::string value, link, image;
  bool strong = false, emphasis = false, code = false, strike = false;
};

std::string plain(const Node &node) {
  std::string out = node.value;
  for (auto &child : node.children) out += plain(*child);
  return out;
}

void runs(const Node &node, Run style, std::vector<Run> &out) {
  if (node.type == 200) { style.value = node.value; out.push_back(style); return; }
  if (node.type == 100 + MD_SPAN_STRONG) style.strong = true;
  if (node.type == 100 + MD_SPAN_EM) style.emphasis = true;
  if (node.type == 100 + MD_SPAN_CODE) style.code = true;
  if (node.type == 100 + MD_SPAN_DEL) style.strike = true;
  if (node.type == 100 + MD_SPAN_A) style.link = node.link;
  if (node.type == 100 + MD_SPAN_IMG) {
    style.image = node.link;
    style.value = plain(node);
    out.push_back(style);
    return;
  }
  for (auto &child : node.children) runs(*child, style, out);
}

void draw_runs(const std::vector<Run> &parts, const Json &assets, float size = 18) {
  ImVec2 origin = ImGui::GetCursorScreenPos();
  float width = std::max(20.0f, ImGui::GetContentRegionAvail().x);
  float x = 0, y = 0, line = size * 1.48f;
  int id = 0;
  for (auto &run : parts) {
    if (!run.image.empty()) {
      if (x > 0) { y += line; x = 0; }
      if (run.image.rfind("asset:", 0) != 0 || !assets.contains(run.image.substr(6)))
        throw std::runtime_error("Markdown images must refer to a declared asset: " + run.image);
      auto &image = gpu->image(assets.at(run.image.substr(6)).get<std::string>());
      float w = std::min(width, static_cast<float>(image.width));
      float h = w * image.height / image.width;
      ImGui::SetCursorScreenPos(ImVec2(origin.x, origin.y + y));
      ImGui::Image(static_cast<ImTextureID>(reinterpret_cast<intptr_t>(image.view)), ImVec2(w, h));
      y += h + 12;
      continue;
    }
    ImFont *font = run.code ? mono : run.strong ? bold : run.emphasis ? italic : regular;
    ImGui::PushFont(font, run.code ? size * 0.92f : size);
    const char *pos = run.value.data(), *end = pos + run.value.size();
    while (pos < end) {
      if (*pos == '\n') { x = 0; y += line; ++pos; continue; }
      bool space = *pos == ' ' || *pos == '\t';
      const char *next = pos + 1;
      while (next < end && *next != '\n' && ((*next == ' ' || *next == '\t') == space)) ++next;
      if (space && x == 0) { pos = next; continue; }
      float word_width = ImGui::CalcTextSize(pos, next).x;
      if (x + word_width > width && x > 0) { x = 0; y += line; if (space) { pos = next; continue; } }
      if (word_width > width) {
        const char *remaining = nullptr;
        ImGui::GetFont()->CalcTextSizeA(ImGui::GetFontSize(), width, 0, pos, next, &remaining);
        if (remaining && remaining > pos) next = remaining;
        word_width = ImGui::CalcTextSize(pos, next).x;
      }
      ImVec2 point(origin.x + x, origin.y + y + (line - size) * 0.35f);
      ImVec4 color = !run.link.empty() ? accent : ink;
      auto draw = ImGui::GetWindowDrawList();
      if (run.code) draw->AddRectFilled(ImVec2(point.x - 2, point.y - 2),
          ImVec2(point.x + word_width + 2, point.y + size + 2), IM_COL32(232, 235, 231, 255), 3);
      draw->AddText(point, ImGui::ColorConvertFloat4ToU32(color), pos, next);
      if (run.strike || !run.link.empty()) {
        float offset = run.strike ? size * 0.55f : size + 1;
        draw->AddLine(ImVec2(point.x, point.y + offset), ImVec2(point.x + word_width, point.y + offset),
                      ImGui::ColorConvertFloat4ToU32(color));
      }
      if (!run.link.empty() && !space) {
        ImGui::SetCursorScreenPos(point);
        ImGui::PushID(id++);
        if (ImGui::InvisibleButton("link", ImVec2(std::max(1.0f, word_width), size + 3))) {
          if (run.link.rfind("https://", 0) == 0 || run.link.rfind("http://", 0) == 0 || run.link.rfind("mailto:", 0) == 0)
            SDL_OpenURL(run.link.c_str());
        }
        if (ImGui::IsItemHovered()) {
          ImGui::SetMouseCursor(ImGuiMouseCursor_Hand);
          ImGui::SetTooltip("%s", run.link.c_str());
        }
        ImGui::PopID();
      }
      x += word_width;
      pos = next;
    }
    ImGui::PopFont();
  }
  ImGui::SetCursorScreenPos(origin);
  ImGui::Dummy(ImVec2(width, y + line));
}

void paragraph(const Node &node, const Json &assets, float size = 18, bool heading = false) {
  std::vector<Run> parts;
  Run style;
  style.strong = heading;
  runs(node, style, parts);
  draw_runs(parts, assets, size);
}

void render(const Node &node, const Json &assets) {
  ImGui::PushID(&node);
  switch (node.type) {
  case MD_BLOCK_P:
    paragraph(node, assets); break;
  case MD_BLOCK_H: {
    static const float sizes[] = {36, 30, 25, 22, 20, 18};
    ImGui::Dummy(ImVec2(0, 5));
    paragraph(node, assets, sizes[std::min(6u, node.level) - 1], true);
    break;
  }
  case MD_BLOCK_HR:
    ImGui::Spacing(); ImGui::Separator(); ImGui::Spacing(); break;
  case MD_BLOCK_CODE:
    block(Json{{"type", "code"}, {"language", node.link}, {"content", plain(node)}}, assets, exporting_document); break;
  case MD_BLOCK_QUOTE: {
    auto start = ImGui::GetCursorScreenPos();
    ImGui::Indent(20);
    for (auto &child : node.children) render(*child, assets);
    ImGui::Unindent(20);
    auto end = ImGui::GetCursorScreenPos();
    ImGui::GetWindowDrawList()->AddLine(ImVec2(start.x + 3, start.y), ImVec2(start.x + 3, end.y - 8),
                                       ImGui::ColorConvertFloat4ToU32(accent), 3);
    break;
  }
  case MD_BLOCK_UL:
  case MD_BLOCK_OL: {
    unsigned index = node.level;
    for (auto &child : node.children) {
      auto point = ImGui::GetCursorScreenPos();
      std::string marker = !child->link.empty() ? child->link : node.type == MD_BLOCK_OL ? std::to_string(index++) + "." : "\xE2\x80\xA2";
      ImGui::GetWindowDrawList()->AddText(point, ImGui::ColorConvertFloat4ToU32(muted), marker.c_str());
      ImGui::Indent(32);
      render(*child, assets);
      ImGui::Unindent(32);
    }
    break;
  }
  case MD_BLOCK_TABLE: {
    std::vector<const Node *> rows;
    for (auto &section : node.children)
      for (auto &row : section->children) rows.push_back(row.get());
    if (!rows.empty() && ImGui::BeginTable("rich-table", rows[0]->children.size(),
                   ImGuiTableFlags_BordersInnerH | ImGuiTableFlags_RowBg | ImGuiTableFlags_SizingStretchSame)) {
      for (auto row : rows) {
        ImGui::TableNextRow();
        for (auto &cell : row->children) {
          ImGui::TableNextColumn();
          paragraph(*cell, assets, 17, cell->type == MD_BLOCK_TH);
        }
      }
      ImGui::EndTable();
    }
    break;
  }
  default: {
    std::vector<Run> inline_parts;
    for (auto &child : node.children) {
      if (child->type >= 100) runs(*child, Run{}, inline_parts);
      else {
        if (!inline_parts.empty()) { draw_runs(inline_parts, assets); inline_parts.clear(); }
        render(*child, assets);
      }
    }
    if (!inline_parts.empty()) draw_runs(inline_parts, assets);
  }
  }
  ImGui::PopID();
}
}

void markdown(const std::string &value, const Json &assets) {
  static std::unordered_map<std::string, std::unique_ptr<Tree>> cache;
  auto it = cache.find(value);
  if (it == cache.end()) it = cache.emplace(value, parse(value)).first;
  render(it->second->root, assets);
}
}
