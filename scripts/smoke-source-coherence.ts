import assert from 'node:assert/strict';
import { extractArticleText, sourceCoherenceScore } from '../src/import/url.js';

const pageUrl='https://example.vn/2-nguoi-tu-vong-sau-khi-uong-nuoc-la-tu-hai.html';
const title='2 người tử vong sau khi uống nước lá tự hái, Bộ Y tế chỉ đạo khẩn';
const correct='Sau khi uống nước pha từ loại lá tự hái, ba người trong một gia đình phải nhập viện. Hai người sau đó tử vong. Cơ quan chuyên môn đang làm rõ loại lá và nguyên nhân ngộ độc; Bộ Y tế yêu cầu địa phương báo cáo và cảnh báo người dân không tự ý sử dụng cây lá không rõ độc tính.';
const wrong='Bộ Y tế yêu cầu điều tra vụ hơn 40 học sinh nghi ngộ độc thực phẩm ở Cà Mau. Các học sinh nhập viện sau bữa ăn tại trường và cơ quan an toàn thực phẩm yêu cầu truy xuất nguồn gốc thực phẩm, lấy mẫu xét nghiệm và rà soát bếp ăn tập thể.';

assert.ok(sourceCoherenceScore(title,correct)>=0.5,'correct article must be coherent with its title');
assert.ok(sourceCoherenceScore(title,wrong)<0.25,'unrelated article must be rejected by coherence gate');

const structuredHtml=`<html><head><script type="application/ld+json">${JSON.stringify([
 {'@type':'NewsArticle',headline:'Hơn 40 học sinh nghi ngộ độc thực phẩm',url:'https://example.vn/related.html',articleBody:wrong+' '+wrong},
 {'@type':'NewsArticle',headline:title,url:pageUrl,articleBody:correct}
])}</script></head><body></body></html>`;
const structured=extractArticleText(structuredHtml,pageUrl,title);
assert.equal(structured.method,'json-ld');
assert.match(structured.body,/uống nước pha từ loại lá/i);
assert.doesNotMatch(structured.body,/hơn 40 học sinh/i);

const selectorHtml=`<html><body><main><section><p>${wrong}</p></section><div class="maincontent"><p>${correct}</p></div></main></body></html>`;
const selected=extractArticleText(selectorHtml,pageUrl,title);
assert.equal(selected.method,'html');
assert.match(selected.body,/uống nước pha từ loại lá/i);
assert.doesNotMatch(selected.body,/hơn 40 học sinh/i);

console.log('Source coherence gate smoke OK',JSON.stringify({correct:sourceCoherenceScore(title,correct),wrong:sourceCoherenceScore(title,wrong),structured:structured.method,selector:selected.method}));
