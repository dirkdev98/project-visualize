#ifndef VISUALIZE_H
#define VISUALIZE_H

#ifdef CIMGUI_DEFINE_ENUMS_AND_STRUCTS
#include "cimplot.h"
#endif
typedef struct ImPlotSpec_c PVPlotSpec;

#ifdef __cplusplus
extern "C" {
#endif

typedef struct { float x, y; } PVSize;
typedef struct { float x, y, z, w; } PVColor;
typedef struct { int count, column, direction; } PVSortSpec;
typedef struct PVImage PVImage;
typedef struct ImFontAtlas ImFontAtlas;
typedef struct ImFont ImFont;

/* Window, UI and disposal calls run on the application main thread. */
int pv_surface_open(int viewer);
int pv_surface_wait(int timeout_ms);
int pv_surface_input(void);
/* Consume an application menu command: 0 for none, 1 for Settings. */
int pv_surface_command(void);
int pv_surface_input_policy(float wheel_scale, int zoom_modifier);
/* Consume accumulated relative pinch scale once per frame. */
float pv_surface_pinch(void);
PVSize pv_surface_size(void);
int pv_surface_limit(void);
int pv_surface_begin(int width, int height, int scale);
/* A retryable result (1) occurs before drawing, so the same frame can be retried. */
int pv_surface_present(void);
void pv_surface_background(PVColor color);
/* Pixels stay caller-owned; capture completes all writes before returning. */
int pv_surface_capture(int width, int height, unsigned char *pixels, int byte_count);
int pv_png_write(const char *file, int width, int height,
                 const unsigned char *bytes, int byte_count);
void pv_surface_close(void);
const char *pv_error(void);
/* Resolve the physical executable independently of its invocation name. */
const char *pv_executable_path(void);
ImFontAtlas *pv_font_atlas(void);
void pv_ui_style(float caret_width);
int pv_input_text(const char *label, const char *hint, char *buffer, int capacity);
void pv_input_clear(unsigned int id);
PVSize pv_font_metrics(ImFont *font, float size);
/* The wrap API requires an end pointer into text; FFI copies the returned suffix. */
const char *pv_text_wrap(const char *text, float wrap_width);
/* Return copied defaults because the library constructor returns pointer storage. */
PVPlotSpec pv_plot_spec(void);
PVImage *pv_image_load(const char *file);
PVSize pv_image_size(PVImage *image);
void pv_image_draw(PVImage *image, PVSize position, PVSize size,
                   PVSize uv0, PVSize uv1, float rounding);
void pv_image_destroy(PVImage *image);
PVSortSpec pv_table_sort(int index);
void pv_plot_tick(int axis, double value, const char *label);
int pv_slider_double(const char *label, double *value, double min, double max);

#ifdef __cplusplus
}
#endif
#endif
