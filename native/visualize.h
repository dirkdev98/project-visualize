#ifndef VISUALIZE_H
#define VISUALIZE_H

#ifdef __cplusplus
extern "C" {
#endif

int pv_render(const char *document_json, const char *output, int width, int scale);
// Window calls stay on the application main thread; update copies the supplied state.
int pv_viewer_start(void);
int pv_viewer_update(const char *state_json);
int pv_viewer_frame(void);
const char *pv_viewer_event(void);
void pv_viewer_close(void);
const char *pv_error(void);

int pv_surface_open(int viewer);
int pv_surface_begin(int width, int height, int scale);
int pv_surface_save(const char *output, int width, int height);
void pv_surface_close(void);

#ifdef __cplusplus
}
#endif
#endif
