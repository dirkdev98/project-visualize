#ifndef VISUALIZE_H
#define VISUALIZE_H

#ifdef __cplusplus
extern "C" {
#endif

typedef struct { float x, y; } PVSize;
typedef struct { float x, y, z, w; } PVColor;
typedef struct { int count, column, direction; } PVSortSpec;
typedef struct { int length, consumed; float width; } PVTextLine;
typedef struct {
  PVColor color;
  float line_weight, marker_size;
  int marker;
  double bar_width;
} PVPlotStyle;
typedef struct PVImage PVImage;
typedef struct ImFontAtlas ImFontAtlas;
typedef struct ImFont ImFont;

/* Window, UI and disposal calls run on the application main thread. */
int pv_surface_open(int viewer);
int pv_surface_wait(int timeout_ms);
int pv_surface_input(void);
PVSize pv_surface_size(void);
int pv_surface_limit(void);
int pv_surface_begin(int width, int height, int scale);
/* A retryable result (1) occurs before drawing, so the same frame can be retried. */
int pv_surface_present(void);
void pv_surface_background(PVColor color);
unsigned char *pv_surface_pixels(int width, int height, int *byte_count);
void pv_bytes_free(void *bytes);
int pv_png_write(const char *file, int width, int height,
                 const unsigned char *bytes, int byte_count);
void pv_surface_close(void);
const char *pv_error(void);
ImFontAtlas *pv_font_atlas(void);
PVSize pv_font_metrics(ImFont *font, float size);
PVTextLine pv_text_line(const char *text, float wrap_width);
PVImage *pv_image_load(const char *file);
PVSize pv_image_size(PVImage *image);
void pv_image_draw(PVImage *image, PVSize size);
void pv_image_destroy(PVImage *image);
PVSortSpec pv_table_sort(int index);
void pv_plot_tick(int axis, double value, const char *label);
void pv_plot_series(const char *label, const double *x, const double *y,
                    int count, int kind, PVPlotStyle style);
void pv_open_url(const char *url);
int pv_slider_double(const char *label, double *value, double min, double max);

#ifdef __cplusplus
}
#endif
#endif
