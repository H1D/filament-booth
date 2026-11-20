# Denoiser weights

`rt_hdr_alb_nrm.tza` holds the trained weights of Intel Open Image Denoise's RT filter for HDR colour with
albedo and normal guides. It is the network Blender runs for Cycles with the "Fast" prefilter. The file is
used unchanged.

| | |
|---|---|
| Source | <https://github.com/RenderKit/oidn-weights> (the `weights` submodule of OIDN v2.5.0, commit `28883d1769d5930e13cf7f1676dd852bd81ed9e7`) |
| SHA-256 | `e586ef2ff48d7fbb7611986405220ed8fc5c13ca79bfc40be4dc742fbf959e1a` |
| Licence | Apache License 2.0 (`LICENSE.txt`), Copyright 2018 Intel Corporation |

`src/photo/denoise.ts` reads it and runs the network on WebGPU. That code is written for this app from OIDN's
Apache-2.0 sources (the UNet, the transfer function, autoexposure and tiling) and is not Intel's code.
