# Dữ liệu đầu vào: "CCoding: kiểm chứng 4 hướng tăng tốc với nghiên cứu" (3/11/2026)

> Giám đốc gửi người điều phối ngày 3/11 (tệp .docx), người giao việc chuyển sang Markdown, bỏ hình 1 (biểu đồ thời gian 5 lượt gọi của `data/runs/T-20261103-104812-fc1/calls.jsonl`). Phân loại dữ liệu: **Nội bộ**, không có DLCN. Tài liệu phân tích nhánh `main` tại `9e6079b`, **không** phải nhánh `perf/vs-claude-loop`. Mọi nhận định trong tài liệu là đầu vào cần kiểm, chưa phải kết luận của phòng.


## Kết luận

CCoding đi đúng hướng ở cả 4 điểm. Nghiên cứu ủng hộ việc chạy song song
có kiểm soát, CTO nghiệm thu và tách model theo vai. Chỗ cần sửa nằm ở
cách làm, không phải kiến trúc. Ba việc nên làm trước:

1.  **Cache của claude-cli đang tốn nhất.** Trong lượt chạy thật duy
    nhất có log, ghi cache chiếm khoảng 68% chi phí. Mỗi lượt gọi ghi
    lại 7--26 nghìn token tiền tố mới thay vì đọc lại. Cần đo tỉ lệ đọc
    cache thành chỉ số và giữ tiền tố ổn định trong một nhiệm vụ.

2.  **Cuộc họp thảo luận chạy nối tiếp 5 lượt rồi thêm 1 lượt chốt.**
    Nghiên cứu \"Debate or Vote\" (2025) cho thấy phần lớn lợi ích của
    tranh luận nhiều agent đến từ việc lấy ý kiến độc lập rồi tổng hợp,
    không đến từ các vòng tranh luận. Nên cho các ý kiến chạy song song,
    hoặc tắt họp với kế hoạch vừa phải, rồi đo bằng bộ benchmark.

3.  **Chọn model đang cố định theo vai, chưa theo dữ liệu.** KPI v2 đã
    đo được điểm theo model. Nên dùng số đó để hạ model cho các pha ít
    rủi ro (tổng hợp, review thay đổi nhỏ) và giữ model mạnh cho lập kế
    hoạch và nghiệm thu.

Lưu ý: số đo thật mới có 1 lượt chạy với 5 lượt gọi. Đủ để thấy hướng,
chưa đủ để chốt con số. Cần chạy bộ benchmark vs-claude trên máy anh để
có số đáng tin.

## Số đo từ log CCoding

Hơn 99% thời gian là chờ model. Lượt chạy thật có 5 lượt gọi nối tiếp
nhau, tổng thời gian gọi model là 79,9 giây, cả nhiệm vụ là 80,0 giây.
Như vậy phần điều phối của CCoding chỉ tốn khoảng 0,1 giây.



Mỗi lượt gọi gần như không có token đầu vào mới (4--6 token). Còn lại là
23--66 nghìn token đọc cache và 7--26 nghìn token ghi cache, chủ yếu là
lời nhắc hệ thống của chính Claude Code. Cả nhiệm vụ nhỏ này dùng 325
nghìn token.

Với runtime mô phỏng, một nhiệm vụ trung bình có 15--17 lượt gọi: 1 định
tuyến, 1 lập kế hoạch, 5 thảo luận, 1 chốt, 4 thực thi, 1--2 review,
0--1 sửa, 1 tổng hợp, 1 nghiệm thu. Trong đó chỉ các lượt thực thi chạy
song song, nên đường găng (chuỗi bước phải chờ nhau) dài khoảng 12 lượt
gọi.

## 1. Số lượt gọi

Nên cắt bớt cuộc họp thảo luận, vì đây là chỗ tốn lượt gọi mà nghiên cứu
ít ủng hộ nhất. Các phần còn lại của CCoding đã đúng hướng.

**Nghiên cứu nói gì**

-   Anthropic: hệ nhiều agent dùng khoảng 15 lần token so với chat, và
    chỉ riêng lượng token đã giải thích 80% chênh lệch kết quả. Họ
    khuyên chia công sức theo độ khó: việc đơn giản 1 agent với 3--10
    lượt gọi công cụ, việc phức tạp mới cần trên 10 subagent
    ([Anthropic,
    2025](https://www.anthropic.com/engineering/multi-agent-research-system)).

-   \"Debate or Vote\" (Choi, Zhu, Li, 2025): \"Majority Voting alone
    accounts for most of the performance gains typically attributed to
    MAD\". Với Qwen2.5-7B, độ chính xác trung bình giảm khi tăng số vòng
    tranh luận (0,738 với 2 vòng, 0,705 với 5 vòng), trong khi bỏ phiếu
    đạt 0,769 ([arXiv 2508.17536](https://arxiv.org/abs/2508.17536v1)).

-   MAST (Cemri và cộng sự, 2025): trong hơn 1.600 vết chạy của 7 hệ
    nhiều agent, khoảng 23% lỗi nằm ở khâu kiểm chứng. Việc thêm người
    có quyền chốt cuối cùng giúp ChatDev tăng 9,4% tỉ lệ thành công
    ([arXiv 2503.13657](https://arxiv.org/abs/2503.13657v3)).

**CCoding đang làm gì**

-   Đã tự bỏ họp khi kế hoạch có từ 2 hạng mục trở xuống hoặc dưới 2
    người tham gia.

-   Giao riêng cho một agent thì bỏ hẳn các bước định tuyến, lập kế
    hoạch và họp.

-   Định tuyến và thảo luận đã chạy trên Haiku.

-   Đã có CTO nghiệm thu và người chốt kế hoạch (trưởng phòng). Đây
    chính là hai biện pháp MAST cho là có tác dụng.

**Khoảng trống**

-   Cuộc họp gồm tới 5 người nói lần lượt, rồi thêm 1 lượt chốt, tức 6
    lượt nối tiếp nhau trên đường găng. Theo kết quả trên, phần đáng giá
    là các ý kiến độc lập, không phải các vòng trao đổi.

-   Chưa có số đo chứng minh cuộc họp làm tăng chất lượng trong chính
    CCoding. Bộ benchmark vs-claude đo được việc này bằng một nhánh thử
    với discussionRounds: 0.

-   Bước tổng hợp và bước nghiệm thu luôn là 2 lượt riêng, kể cả với
    nhiệm vụ một hạng mục.

## 2. Chạy song song

Cách CCoding cho chạy song song có kiểm soát là đúng với việc lập trình.
Còn hai chỗ nối tiếp có thể mở ra mà không tăng rủi ro xung đột.

**Nghiên cứu nói gì**

-   Anthropic: cho 3--5 subagent chạy song song và mỗi subagent gọi từ 3
    công cụ cùng lúc \"cut research time by up to 90% for complex
    queries\". Nhưng họ cũng viết \"most coding tasks involve fewer
    truly parallelizable tasks than research\" ([Anthropic,
    2025](https://www.anthropic.com/engineering/multi-agent-research-system)).

-   Cognition (Walden Yan, 2025): các subagent chạy song song \"might
    give conflicting responses\". Nguyên tắc của họ là chia sẻ toàn bộ
    bối cảnh, vì mỗi hành động mang theo một quyết định ngầm ([Don\'t
    build
    multi-agents](https://cognition.com/blog/dont-build-multi-agents)).

-   LLMCompiler (Kim và cộng sự, 2024): lập đồ thị phụ thuộc rồi chạy
    song song các bước độc lập đạt \"latency speedup of up to 3.7x\" so
    với ReAct ([arXiv 2312.04511](https://arxiv.org/abs/2312.04511)).

**CCoding đang làm gì**

-   Các hạng mục chạy theo đồ thị phụ thuộc (dependsOn), tối đa 3 hạng
    mục cùng lúc và 2 nhiệm vụ cùng lúc. Mỗi hạng mục có worktree riêng.
    Đây đúng là mô hình của LLMCompiler.

-   Buổi họp và bước chốt kế hoạch làm việc chia sẻ bối cảnh trước khi
    chạy song song, đúng ý của Cognition. Khi workspace dự án dùng
    chung, các hạng mục có chạy lệnh sẽ làm lần lượt.

**Khoảng trống**

-   Buổi họp chạy nối tiếp: mỗi người đọc ý kiến của người trước. Với
    vòng đầu, các ý kiến có thể lấy song song rồi để trưởng phòng tổng
    hợp. Đây là dạng \"lấy ý kiến độc lập rồi tổng hợp\" mà \"Debate or
    Vote\" thấy hiệu quả. 5 lượt nối tiếp thành 1 lượt chờ.

-   Review chờ mọi hạng mục xong mới chạy 1 lượt cho cả đợt. Hạng mục
    xong sớm phải ngồi chờ hạng mục chậm nhất. Có thể review từng hạng
    mục ngay khi xong, giữ 1 lượt review tổng ngắn ở cuối. Cái giá là
    thêm lượt gọi, nên chỉ đáng làm với kế hoạch từ 3 hạng mục.

-   Không nên tăng maxParallel quá 3 cho việc sửa mã. Việc lập trình ít
    chỗ song song thật, và mỗi nhánh thêm là thêm khả năng xung đột khi
    gộp. Nên giữ 3 cho tới khi benchmark cho thấy khác.

## 3. Cache prompt

Với runtime API, CCoding đã dùng cache đúng cách. Với claude-cli, cache
gần như bị ghi lại ở mọi lượt gọi. Đây là chỗ tốn nhất trong cả 4 hướng.

**Tài liệu nói gì** ([prompt
caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching))

-   Tiền tố được cache theo thứ tự tools → system → messages. Đổi danh
    sách công cụ làm mất cache của cả ba phần. Muốn trúng cache, đoạn
    tiền tố phải giống nhau 100%.

-   Độ dài tối thiểu để được cache: 512 token với Opus 5.5, Sonnet 5.5,
    Haiku 5.5. Prompt ngắn hơn thì không được cache và cũng không báo
    lỗi.

-   Ghi cache tốn 1,25 lần giá đầu vào (với loại cache 1 giờ là 2 lần).
    Đọc cache trên Opus 5.5 và Sonnet 5.5 chỉ tốn 0,05 lần. Nói cách
    khác, một token ghi tốn bằng 25 token đọc.

-   Cache mặc định sống 5 phút và được làm mới miễn phí mỗi lần trúng.
    Mỗi prompt đặt được tối đa 4 điểm cache.

**CCoding đang làm gì**

-   Runtime API: đặt bối cảnh chung của nhiệm vụ lên đầu, tiếp theo là
    hồ sơ vai trò, mỗi khối một điểm cache. Bảng giá mới giảm trọng số
    của phần đọc từ cache khi tính trần token vòng công cụ. Model đều là
    bản 5.5 nên đạt ngưỡng 512 token.

-   claude-cli: CCoding ghép mọi thứ vào một tin nhắn và để Claude Code
    tự quản cache. Mỗi lượt gọi là một tiến trình claude -p mới, không
    giữ phiên.

**Khoảng trống**

-   Trong lượt chạy thật, mỗi lượt gọi ghi 7--26 nghìn token cache, dù
    các lượt cách nhau dưới 20 giây. Giả thuyết (chưa kiểm chứng): danh
    sách công cụ đổi theo pha (lập kế hoạch, review, thực thi có bộ công
    cụ khác nhau) và thư mục làm việc đổi theo worktree. Cả hai nằm ở
    đầu tiền tố của Claude Code nên phá cache. Cách thử: gọi hai lượt
    giống hệt nhau trong cùng thư mục rồi so cacheWrite.

-   Chưa có chỉ số tỉ lệ trúng cache trong KPI hay trang Token. Dữ liệu
    đã có sẵn trong calls.jsonl (cacheRead, cacheWrite).

-   Khi nhiệm vụ chờ duyệt kế hoạch quá 5 phút, cache hết hạn và bước
    thực thi phải ghi lại từ đầu. Chỉ với runtime API mới có thể chọn
    cache 1 giờ cho bối cảnh nhiệm vụ ở các nhiệm vụ bật duyệt kế hoạch.
    Cache 1 giờ tốn 2 lần giá khi ghi, nên chỉ đáng khi khoảng chờ
    thường từ 5 đến 60 phút.

## 4. Chọn model theo giai đoạn

Cách chia của CCoding giống với cách Anthropic làm: model mạnh cho người
dẫn dắt, model rẻ hơn cho người làm. Chỗ lệch là bước ít rủi ro đang
dùng model đắt, còn bước nghiệm thu quan trọng lại dùng model rẻ hơn.

**Nghiên cứu nói gì**

-   Anthropic dùng Opus 4 làm agent dẫn dắt và Sonnet 4 làm subagent,
    tốt hơn Opus 4 chạy một mình 90,2%. Chọn model là một trong ba yếu
    tố, cùng lượng token và số lượt gọi công cụ, giải thích 95% chênh
    lệch kết quả ([Anthropic,
    2025](https://www.anthropic.com/engineering/multi-agent-research-system)).

-   RouteLLM (Ong và cộng sự, 2024): chuyển từng câu hỏi sang model mạnh
    hoặc yếu theo độ khó giúp \"reduce costs by over 2 times without
    sacrificing response quality\" ([arXiv
    2406.18665](https://arxiv.org/abs/2406.18665)).

-   MAST: khoảng 23% lỗi của hệ nhiều agent nằm ở khâu kiểm chứng. Bước
    kiểm chứng là chỗ không nên tiết kiệm ([arXiv
    2503.13657](https://arxiv.org/abs/2503.13657v3)).

**CCoding đang làm gì**

-   Định tuyến và thảo luận chạy Haiku 5.5, rẻ khoảng 20 lần so với
    Sonnet 5.5.

-   4 agent chạy Opus (hai trưởng phòng, kiến trúc sư giải pháp,
    peer-reviewer), 16 agent chạy Sonnet, trong đó có CTO và QA. Opus
    5.5 đắt gấp đôi Sonnet 5.5.

-   Có sẵn chỗ đặt model theo pha (phases.models, phaseModels của từng
    nhiệm vụ, models của dự án). KPI v2 có \--by model để so điểm theo
    model.

**Khoảng trống**

-   Bước tổng hợp chạy theo model của trưởng phòng (Opus), dù chủ yếu là
    viết lại báo cáo. Trong lượt chạy thật, đây là lượt có đầu ra lớn
    thứ hai. Ứng viên đầu tiên để chuyển sang Sonnet.

-   CTO nghiệm thu, chốt kiểm chứng cuối cùng, lại chạy Sonnet. Theo
    MAST, nên thử Opus ở bước này, hoặc ít nhất đo tỉ lệ nghiệm thu sai
    của Sonnet bằng bộ probe.

-   Model gắn cố định theo vai, không theo độ khó. Một việc sửa chính tả
    và một việc thiết kế kiến trúc dùng cùng model lập kế hoạch. Bước
    định tuyến đã đánh giá nhiệm vụ, nên có thể cho nó chấm thêm độ khó
    để chọn Sonnet hay Opus cho bước lập kế hoạch, giống ý tưởng của
    RouteLLM ở mức đơn giản.

## Đề xuất cải tiến

Xếp theo thứ tự nên làm: việc ít công mà tác động lớn đứng trước. Mỗi
việc đều chạy A/B bằng bộ benchmark vs-claude trước khi đổi mặc định.

1.  **Đo tỉ lệ trúng cache.** Công thấp, tác động cao. Thêm chỉ số
    cacheRead / (cacheRead + cacheWrite + input) theo lượt gọi, pha và
    runtime vào trang Token và KPI v2. Không có số này thì mọi thay đổi
    về cache đều là đoán.

2.  **Kiểm chứng rồi ổn định tiền tố của claude-cli.** Công vừa, tác
    động cao nếu giả thuyết đúng. Trước hết gọi hai lượt giống hệt nhau
    để xem phần ghi cache đến từ đâu. Nếu do danh sách công cụ, thì giữ
    cùng một bộ công cụ trong suốt nhiệm vụ và để hook claude-guard chặn
    theo pha. Nếu do thư mục làm việc, thì xét chạy các pha không sửa
    tệp ở thư mục gốc của nhiệm vụ. Mục tiêu: ghi cache dưới 20% chi
    phí.

3.  **Rút gọn cuộc họp.** Công thấp. Thử hai cách: lấy ý kiến vòng đầu
    song song rồi để trưởng phòng chốt, hoặc discussionRounds: 0 với kế
    hoạch từ 3 hạng mục trở xuống. So với cách hiện tại về thời gian,
    token và tỉ lệ đạt.

4.  **Đổi model hai bước.** Công thấp, chỉ là cấu hình. Bước tổng hợp
    chuyển sang Sonnet, bước CTO nghiệm thu thử Opus. Đo bằng KPI v2
    \--by model và các probe trung thực và hiệu chỉnh.

5.  **Gộp tổng hợp với nghiệm thu khi nhiệm vụ chỉ có 1 hạng mục.** Công
    vừa. Bớt 1 lượt gọi trên đường găng của loại nhiệm vụ phổ biến nhất.
    Giữ nguyên bước nghiệm thu riêng cho kế hoạch nhiều hạng mục.

6.  **Chọn model lập kế hoạch theo độ khó.** Công vừa. Bước định tuyến
    chấm thêm độ khó 1--3: mức 1 dùng Sonnet, mức 3 dùng Opus.

7.  **Review từng hạng mục ngay khi xong.** Công cao, chỉ áp dụng với kế
    hoạch từ 3 hạng mục. Giảm thời gian chờ nhưng thêm lượt gọi, nên chỉ
    làm nếu bước 1--3 xong mà thời gian vẫn là vấn đề.

8.  **Cache 1 giờ cho nhiệm vụ có bước duyệt kế hoạch** (chỉ với runtime
    API). Công thấp, tác động nhỏ. Chỉ đáng khi số đo cho thấy thời gian
    chờ duyệt thường từ 5 đến 60 phút.

Cách đo trước và sau: cùng bộ nhiệm vụ vs-claude, mỗi nhánh thử chạy ít
nhất 3 lần. So thời gian hoàn thành, chi phí quy theo giá API, tỉ lệ đạt
kiểm tra và điểm KPI v2. Một thay đổi chỉ được giữ khi tỉ lệ đạt không
giảm.

## Nguồn

-   Anthropic, [How we built our multi-agent research
    system](https://www.anthropic.com/engineering/multi-agent-research-system),
    06/2025

-   Anthropic, [Prompt
    caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching),
    tài liệu API (đọc ngày 03/11/2026)

-   Choi, Zhu, Li, [Debate or Vote: Which Yields Better Decisions in
    Multi-Agent Large Language
    Models?](https://arxiv.org/abs/2508.17536v1), 2025

-   Cemri và cộng sự, [Why Do Multi-Agent LLM Systems
    Fail?](https://arxiv.org/abs/2503.13657v3), 2025

-   Ong và cộng sự, [RouteLLM: Learning to Route LLMs with Preference
    Data](https://arxiv.org/abs/2406.18665), 2024

-   Kim và cộng sự, [An LLM Compiler for Parallel Function
    Calling](https://arxiv.org/abs/2312.04511), 2024

-   Walden Yan (Cognition), [Don\'t Build
    Multi-Agents](https://cognition.com/blog/dont-build-multi-agents),
    06/2025

-   Số đo CCoding: calls.jsonl của 4 nhiệm vụ trong môi trường thử, gồm
    1 nhiệm vụ chạy thật qua claude-cli và 3 nhiệm vụ chạy runtime mô
    phỏng. Mã nguồn ở nhánh main tại commit 9e6079b.
