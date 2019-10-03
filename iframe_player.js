function replacePlayer(){
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        videoId: vm.tabQueue.mvList[0].Id,
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }/*,
        playerVars: {
            "rel": 0,
            "autoplay": 0,
            "wmode": "opaque",
            'origin': location.protocol + '//' + location.hostname + "/"
        }*/
    });
}

function onPlayerStateChange(event) {
    if (event.data == YT.PlayerState.ENDED)
        playNextMovie();
}

function onPlayerError(event) {
    switch (event.data) {
        case 100://動画が見つからない(非公開含む)
            playNextMovie();
            iziToast.error({
                position: 'topRight',
                title: 'Skip Movie',
                message: '動画が見つかりません。削除や非公開化によるものです。'
            });
            break;    
        case 101://埋め込み不可の動画
        case 150://埋め込み不可の動画
            playNextMovie();
            iziToast.error({
                position: 'topRight',
                title: 'Skip Movie',
                message: '埋め込み不可の動画です。'
            });
            break;
        case 2://リクエストが無効なパラメータ値 動画IDのフォーマットが異なる
            playNextMovie();
            iziToast.error({
                position: 'topRight',
                title: 'Skip Movie',
                message: 'Youtubeへの再生リクエストに無効なパラメータが設定されました。動画IDのフォーマットが異なる可能性があります。'
            });
            break;
        case 5://HTML5プレイヤーに関するエラー
            playNextMovie();
            iziToast.error({
                position: 'topRight',
                title: 'Skip Movie',
                message: 'HTML5プレイヤーに関するエラーが発生しました。'
            });
            break;
        
        default:
            iziToast.error({
                position: 'topRight',
                title: 'Unknown Error',
                message: 'Stop movie'
            });
    }
}

function onPlayerReady(event) {
    getMovieInformation(vm.tabQueue.mvList[vm.tabQueue.mvListCt]);
    getMovieList(vm.tabPlay,true,vm.tabQueue.mvList[vm.tabQueue.mvListCt].Id);
    event.target.playVideo();
}

function playNextMovie() {
    //ページロード後最初の再生時にプレイヤーはプレイヤーを読み込む。
    if(vm.tabCommon.playerStart==false){
        //vm.tabQueue.mvListに初めて動画が追加されたとき
        //divをiframe置き換えてプレイヤー設置
        //(準備が整ったらイベントトリガーでonPlayerReady()が実行される。)
        //つまり初回にこの関数が呼ばれたときは、再生処理はこの関数ではなくonPlayerReady()で行われる
        vm.tabQueue.mvList.shift();
        vm.tabQueue.mvListCt=0;
        replacePlayer();
        vm.tabCommon.playerStart=true;
        vm.tabCommon.playerFinish=false;
        return;
    }

    //vm.tabQueue.mvListCtの更新
    if(vm.tQloop==true){//ループ
        vm.tabQueue.mvListCt = (vm.tabQueue.mvListCt + 1) % vm.tabQueue.mvList.length;
    }else{
        if(vm.tabQueue.mvListCt + 1 >=vm.tabQueue.mvList.length){//リストの末尾に到達
            if(vm.tQautoPlayRelatedMovie==true){//末尾動画の関連動画再生がOn
                let playMovie;
                if(vm.tQautoPlayNewRelatedMovie==true){//関連動画を未再生のものに限定
                    for(let i=0,iMax=vm.tabPlay.mvList.length; i<iMax ;i++){
                        const isExistMv= vm.tabQueue.mvList.find((mv)=>{
                            return mv.Id==vm.tabPlay.mvList[i].Id
                        });
                        if(isExistMv==undefined){
                            playMovie =vm.tabPlay.mvList[i];
                            break;          
                        }
                    } //関連動画リストがすべて再生済みならリストの続きをロード後、コールバックでもう一度playNextMovie
                    if(playMovie==undefined){
                        vm.relatedMovieMore(playNextMovie);
                        return;
                    }
                }else{
                    playMovie=vm.tabPlay.mvList[0];
                }
                vm.addMovieQueue("PLAY_NOW", playMovie);
            }else{//ループせず関連動画も再生しない
                vm.tabCommon.playerFinish=true;
            }
            return 0;
        }
        vm.tabQueue.mvListCt = vm.tabQueue.mvListCt + 1;
    }

    getMovieInformation(vm.tabQueue.mvList[vm.tabQueue.mvListCt]);
    vm.tabPlay.fullDescription=false;

    //再生しようとした動画が移動操作中の場合キャンセル
    if( vm.tabQueue.move.able==true 
        &&vm.tabQueue.move.from==vm.tabQueue.mvListCt){
            vm.moveCancel();
    }

    //関連動画リストの取得
    getMovieList(vm.tabPlay,true,vm.tabQueue.mvList[vm.tabQueue.mvListCt].Id);

    player.loadVideoById({
        videoId: vm.tabQueue.mvList[vm.tabQueue.mvListCt].Id,
        suggestedQuality: 'small'
    });
}

function getMovieList(tab,listReset,newWordSubmit,callback) {
    /*引数
    tab..tabQueue,tabPlay,tabSearch
    listReset..true/false 
    [newWordSubmit..検索パラメータ 任意
    [callback..リスト更新後に行いたい関数 任意]

    tab.preWord+tab.wordSubmit (とnextPageTokenがあればこれも)をGETでyoutubeに送信
    tab.mvListに動画をpush
    tab.nextPageTokenを更新
    */

    //初期化処理
    if(listReset==true){
        tab.mvList=[];
        tab.nextPageToken='';
    }
    if(newWordSubmit != undefined){
        tab.wordSubmit=newWordSubmit;
    }

    const requestUrl
        = 'https://www.googleapis.com/youtube/v3/search?'
        + tab.preWord + tab.wordSubmit
        + (tab.nextPageToken == '' ? '' : '&pageToken=' + tab.nextPageToken)
        + '&key=' + YoutubeKey
        + '&part=snippet&order=relevance&regionCode=jp&type=video&videoEmbeddable=true';
    const date = new Date();
    axios.get(requestUrl)
        .then((res)=> {
            res.data.items.forEach((item, index) => {
                const dt=new Date(item.snippet.publishedAt);
                let dsc=item.snippet.description;
                if(dsc.length>210) //説明が長すぎる場合は210文字でカットして...を付ける
                    dsc=dsc.substring(0,210)+'...';
                const searchMovie = {
                    uniqueKey: `${date.getTime()}#${index}`,
                    Id: item.id.videoId,
                    title: item.snippet.title,
                    description210: dsc,
                    thumbnail: item.snippet.thumbnails.default.url,
                    publishedAt: dt.toLocaleString(),
                    description: '',//以下は検索リクエストからは取得できない値。再生時に動画毎に取得している
                    duration: '',
                    viewCount: '',
                    channelTitle: ''
                };
                tab.mvList.push(searchMovie);
            });
            tab.nextPageToken = res.data.nextPageToken;
            if(callback!=undefined && typeof callback =='function')
                setTimeout(callback, 100);
        }).catch(function (err) {
            console.log(err);
            iziToast.error({
                position: 'topRight',
                title: 'Reject http request',
                message: 'Youtubeとの通信に失敗し、動画の検索結果を取得することができませんでした。'
            });
        });
}

function getMovieInformation(mv){
    const requestUrl
        = 'https://www.googleapis.com/youtube/v3/videos?'
        +  'id=' +mv.Id
        + '&key=' + YoutubeKey
        + '&part=snippet,contentDetails,statistics&regionCode=jp';
//    const date = new Date();
    axios.get(requestUrl)
        .then(function (res) {
//            mv.uniqueKey=`${date.getTime()}#added`;
            mv.description = res.data.items[0].snippet.description;
            mv.duration = res.data.items[0].contentDetails.duration.replace('PT','').replace('H','hour').replace('M','min').replace('S','sec');
            mv.viewCount = res.data.items[0].statistics.viewCount;
            mv.channelTitle = res.data.items[0].snippet.channelTitle;
        }).catch(function (err) {
            console.log(err);
            iziToast.error({
                position: 'topRight',
                title: 'Reject http request',
                message: 'Youtubeとの通信に失敗し、動画の詳細を取得することができませんでした。'
            });
        });
}

function playRestart(){
    if(vm.tabCommon.playerFinish==true){
        vm.tabCommon.playerFinish=false;
        playNextMovie();
    }
}