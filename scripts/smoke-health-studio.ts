import { auditHealthEditorial } from '../src/health/safety.js';
import type { SourceFact } from '../src/editorial/source-intelligence.js';

const facts:SourceFact[]=[
 {kind:'event',text:'Đột quỵ là tình trạng cấp cứu cần được nhận biết sớm.',confidence:.95,corroboratedBy:1,support:'corroborated'},
 {kind:'advice',text:'Khi có dấu hiệu nghi ngờ cần gọi cấp cứu và đến cơ sở y tế.',confidence:.96,corroboratedBy:1,support:'corroborated'},
 {kind:'context',text:'Nhận biết triệu chứng sớm giúp rút ngắn thời gian tiếp cận điều trị.',confidence:.9,corroboratedBy:1,support:'corroborated'},
];

const safe=auditHealthEditorial({title:'Dấu hiệu cảnh báo đột quỵ',script:'Các dấu hiệu đột quỵ có thể xuất hiện đột ngột. Nếu nghi ngờ, cần gọi cấp cứu 115 và đến cơ sở y tế để được đánh giá.',facts,audience:'general'});
if(safe.status!=='pass')throw new Error('Health Safety phải PASS với nội dung giáo dục cấp cứu phù hợp');

const blocked=auditHealthEditorial({title:'Điều trị bệnh',script:'Phương pháp này chữa khỏi 100% và người bệnh có thể tự ý ngừng thuốc.',facts,audience:'patient'});
if(blocked.status!=='block')throw new Error('Health Safety phải BLOCK tuyên bố điều trị tuyệt đối/không an toàn');
const dose=auditHealthEditorial({title:'Thông tin dùng thuốc',script:'Tài liệu nguồn có đề cập liều 500 mg trong một bối cảnh điều trị cụ thể.',facts,audience:'medical'});
if(dose.status!=='review'||!dose.medicationSpecific)throw new Error('Nội dung có liều thuốc phải vào Medical Review');

console.log('Health Content Studio V1 medical safety smoke OK',JSON.stringify({safe:safe.status,blocked:blocked.status,dose:dose.status,score:safe.score}));
