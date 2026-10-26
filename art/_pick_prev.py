import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ink, anims, knight
A = anims.anims_for('picareta')
sub = {k: A[k] for k in ('idle', 'run', 'attack', 'attack_up')}
ink.build_atlas('knight-picareta-prev', sub, 'knight', knight.W, knight.H, knight.FEET, 'out/pick', pixel=ink.KNIGHT_PIXEL,
                extra={'kw': {'weapon': 'picareta'}}, preview='out/pick/prev.png')
