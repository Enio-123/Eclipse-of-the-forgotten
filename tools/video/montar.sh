#!/bin/sh
# Junta os trechos gravados (capture.cjs) e a trilha (audio.cjs) no vídeo final, na ordem do roteiro.
# uso: sh tools/video/montar.sh <pasta dos trechos> <vídeo de saída .mp4>
set -e
DIR=$(cd "$1" && pwd)
OUT=$2
ORDER=$(node -e "const s=require('fs').readFileSync('$(dirname "$0")/plan.js','utf8');console.log(JSON.parse(s.match(/window\.__order = (\[[^\]]*\])/)[1].replace(/'/g,'\"')).join(' '))")
: > "$DIR/lista.txt"
for id in $ORDER; do
  if [ -f "$DIR/$id.mp4" ]; then echo "file '$DIR/$id.mp4'" >> "$DIR/lista.txt"; fi
done
# o vídeo vai sem recodificar (os trechos saem todos do mesmo jeito); com CRF=n ele é recodificado nessa qualidade, para
# um arquivo menor de mandar (os trechos saem em CRF 16, pesados por causa do grão e da chuva). O som sobe para -16 LUFS,
# o volume de vídeo na internet
if [ -n "$CRF" ]; then VC="-c:v libx264 -preset slow -crf $CRF -pix_fmt yuv420p"; else VC="-c:v copy"; fi
# o volume em duas passadas: a primeira mede a trilha, a segunda normaliza com a medida. O pico fica em -3,5 dB antes
# do AAC porque o codificador passa uns 2 dB nos golpes (com -1,5 o vídeo chegava a +0,3 dB e estourava)
M=$(ffmpeg -hide_banner -nostats -i "$DIR/trilha.wav" -af loudnorm=I=-16:TP=-3.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$M" | sed -n "s/.*\"$1\" : \"\([^\"]*\)\".*/\1/p"; }
LN="loudnorm=I=-16:TP=-3.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$DIR/lista.txt" -i "$DIR/trilha.wav" -map 0:v -map 1:a $VC \
  -af "$LN" -ar 48000 -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT"
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height -of compact "$OUT"
