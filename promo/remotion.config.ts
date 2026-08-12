import { Config } from "@remotion/cli/config";

/* H.264 en MP4: es lo que reproduce GitHub en un README y lo que aceptan X,
   LinkedIn e Instagram sin recodificar. */
Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
Config.setOverwriteOutput(true);
/* ⚠ El CRF va en el script de `render` del package.json y NO aquí. Puesto en
   este archivo se le aplica también al GIF, que no admite esa opción, y el
   render del GIF se cae con un TypeError que no menciona a este archivo por
   ninguna parte. Lo mismo valdría para cualquier ajuste que sea de un códec
   concreto: en la configuración global solo lo que valga para todos. */
