import bpy, json
s = bpy.context.scene
s.render.engine = 'CYCLES'
c = s.cycles
keys = ['samples','adaptive_threshold','use_adaptive_sampling','adaptive_min_samples','max_bounces','diffuse_bounces','glossy_bounces','transmission_bounces','volume_bounces','transparent_max_bounces','sample_clamp_direct','sample_clamp_indirect','pixel_filter_type','filter_width','caustics_reflective','caustics_refractive','blur_glossy','light_sampling_threshold','use_light_tree','film_exposure','min_light_bounces','min_transparent_bounces','sampling_pattern','use_denoising','denoiser']
out = {k: getattr(c, k) for k in keys if hasattr(c, k)}
out['view_transform'] = s.view_settings.view_transform
out['look'] = s.view_settings.look
out['looks'] = [l.identifier for l in type(s.view_settings).bl_rna.properties['look'].enum_items] if False else None
out['exposure'] = s.view_settings.exposure
out['gamma'] = s.view_settings.gamma
out['film_transparent'] = s.render.film_transparent
print('DEFAULTS ' + json.dumps(out))
