const { Collection, MessageEmbed, Client } = require('discord.js');
const Mongoose = require('mongoose');
const moment = require('moment');
const Settings = require('./Settings.json');
const Invite = new Client();
const logs = require('discord-logs');
logs(Invite);

Mongoose.connect('Mongourlgirin'.replace('<dbname>', Settings.DatabaseName), {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false
});


  
const InviteSchema = Mongoose.Schema({
    Id: { type: String, default: null },
    Inviter: { type: String, default: null },
    Total: { type: Number, default: 0 },
    Successful: { type: Number, default: 0 },
    Unsuccessful: { type: Number, default: 0 },
    Fake: { type: Boolean, default: false }
});
const InviteModel = Mongoose.model('Invites', InviteSchema);
const RLSchema = Mongoose.Schema({
    Id: { type: String, default: null },
    Logs: { type: Array, default: [] }
});
const RLModel = Mongoose.model('RolLogs', RLSchema);

const Invites = new Collection();

  

Invite.on('inviteCreate', (invite) => {
    const GuildInvites = Invites.get(invite.guild.id);
    GuildInvites.set(invite.code, invite);
    Invites.set(invite.guild.id, GuildInvites);
});

Invite.on('inviteDelete', (invite) => {
    const GuildInvites = Invites.get(invite.guild.id);
    GuildInvites.delete(invite.code);
    Invites.set(invite.guild.id, GuildInvites);
});

Invite.on('guildMemberAdd', async (member) => {
    if (member.user.bot) return;
    const GuildInvites = (Invites.get(member.guild.id) || new Collection()).clone()
        , Guild = member.guild
        , Fake = Date.now() - member.user.createdTimestamp < Settings.FakeDays ? true : false
        , Channel = Guild.channels.cache.get(Settings.Channel);

    Guild.fetchInvites().then(async invites => {
        const invite = invites.find(_i => GuildInvites.has(_i.code) && GuildInvites.get(_i.code).uses < _i.uses) || GuildInvites.find(_i => !invites.has(_i.code)) || Guild.vanityURLCode;
        Invites.set(Guild.id, invites);
        let successful = 0, content = `${member} sunucuya giriş yaptı.`;

        if (invite.inviter && invite.inviter.id !== member.id) {
            const InviterData = await InviteModel.findOne({ Id: invite.inviter.id }) || new InviteModel({ Id: invite.inviter.id });
            if (Fake) InviterData.Unsuccessful += 1;
            else successful = InviterData.Successful += 1;
            InviterData.Total += 1;
            InviterData.save();
            InviteModel.findOneAndUpdate({ Id: member.id }, { $set: { Inviter: invite.inviter.id, Fake: Fake } }, { upsert: true, setDefaultsOnInsert: true }).exec();
        }

        if (Channel) {
            if (invite === Guild.vanityURLCode) content = `${member} sunucuya özel urlyi kullanarak girdi!`;
            else if (invite.inviter.id === member.id) content = `${member} kendi daveti ile sunucuya giriş yaptı.`
            else content = `${member} katıldı! **Davet eden**: ${invite.inviter.tag} \`(${successful} davet)\` ${Fake ? ':x:' : ':white_check_mark:'}`;
            Channel.send(content);
        }

    }).catch(console.error);
});

Invite.on('guildMemberRemove', async (member) => {
    if (member.user.bot) return;
    let successful = 0, content = `${member} sunucudan çıktı.`;
    const MemberData = await InviteModel.findOne({ Id: member.id }) || {}
        , Channel = member.guild.channels.cache.get(Settings.Channel);

    if (!MemberData && Channel) return Channel.send(content);

    const InviterData = await InviteModel.findOne({ Id: MemberData.Inviter }) || new InviteModel({ Id: MemberData.Inviter });

    if (MemberData.Fake === true && data.Inviter && InviterData.Unsuccessful > 0) InviterData.Unsuccessful -= 1;
    else if (MemberData.Inviter && InviterData.Successful > 0) InviterData.Successful -= 1;
    successful = InviterData.Successful
    InviterData.Total -= 1;
    InviterData.save();

    const InviterMember = member.guild.member(MemberData.Inviter);

    if (Channel) {
        content = `${member} sunucudan çıktı. ${InviterMember ? `**Davet eden**: ${InviterMember.user.tag} \`(${successful} davet)\`` : 'Davetçi bulunamadı!'}`;
        Channel.send(content);
    }
});

Invite.on('message', async (message) => {
    if (message.author.bot || (message.channel.type === 'dm' && !message.guild) || !message.content.startsWith(Settings.Prefix)) return;

    const embed = new MessageEmbed().setColor(message.member.displayHexColor);
    const args = message.content.slice(Settings.Prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'rollog' || command === 'rol-log') {
        const user = message.mentions.users.first() || Invite.users.cache.get(args[0]);
        if (!user) return message.reply('Lütfen birini belirt.');
        const embed = new MessageEmbed().setColor('RANDOM').setAuthor(user.tag, user.avatarURL({ dynamic: true }));
        const data = await RLModel.findOne({ Id: user.id });
        let msg = data ? data.Logs.map((res) => `\`[${moment(res.Date).format('DD/MM hh:mm')}, ${res.Type}]\` <@${res.Executor}>: <@&${res.Role}>`).join('\n') : 'Veri bulunamadı.';
        if (msg.length < 2000) return message.channel.send(embed.setDescription(msg));
        for (var i = 0; i < (Math.floor(msg.length/2000)); i++) {
            if(i > 5) return message.channel.send('Hepsini gösteremiyorum.');
            message.channel.send(embed.setDescription(msg.slice(0, 2000)));
            msg = msg.slice(2000);
        }
    } else if (command === 'invite' || command === 'invites' || command === 'davetler' || command === 'davet') {
        const Member = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || message.member;
        const InviteData = await InviteModel.findOne({ Id: Member.id }) || { Total: 0, Successful: 0, Unsuccessful: 0 };
        if (InviteData.Total) {
            let weekdays = await InviteModel.find({ Inviter: Member.id });
            weekdays = weekdays.filter(data => message.guild.members.cache.has(data.Id) && (Date.now() - message.guild.members.cache.get(data.Id).joinedTimestamp) < 1000*60*60*24*7).length
            embed.setDescription(`${Member.id === message.author.id ? 'Senin' : `**${Member.user.username}** sahip olduğun`} \`${InviteData.Total}\` davetin var. (\`${InviteData.Successful}\` başarılı, \`${InviteData.Unsuccessful}\` başarısız, \`${weekdays}\` haftalık)`);
        } else {
            embed.setDescription(`Kullanıcının verilerini bulamadım.`);
        }
        embed.setAuthor(Member.user.username, Member.user.avatarURL({ dynamic: true }), `https://discord.com/users/${Member.id}`);
        message.channel.send(embed);
    } else if (command === 'members' || command === 'üyeler') {
        const Member = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || message.member;
        const Members = await InviteModel.find({ Inviter: Member.id });

        if (!Members || !Members.length) return message.channel.send(embed.setDescription('Kullanıcının verilerini bulamadım.'));

        let page = 1;
        const liste = Members.map((e) => {
            const eMember = message.guild.member(e.Id);
            if (eMember) return `${eMember} - **${moment(new Date(eMember.joinedAt)).format('YYYY.MM.DD | HH:mm:ss')}**`
        });

        var msg = await message.channel.send(new MessageEmbed().setDescription([
            `Davet Ettiği Üyeler (Toplam ${Members.length} davet)\n`,
            `${liste.slice(page == 1 ? 0 : page * 10 - 10, page * 10).join('\n')}`
        ]).setAuthor(Member.user.username, Member.user.avatarURL({ dynamic: true }), `https://discord.com/users/${Member.id}`));

        if (liste.length > 10) {
            await msg.react('◀');
            await msg.react('▶' );

            let collector = msg.createReactionCollector((react, user) => ['◀', '▶'].some(e => e == react.emoji.name) && user.id == message.member.id, { time: 200000 });

            collector.on('collect', async(react) => {
                if (react.emoji.name == '▶') {
                    await react.users.remove(message.author.id).catch(() => undefined)
                    if (liste.slice((page + 1) * 10 - 10, (page + 1) * 10).length <= 0) return;
                    page += 1;
                    let newList = liste.slice(page == 1 ? 0 : page * 10 - 10, page * 10).join('\n');
                    msg.edit(new MessageEmbed().setDescription(`${newList}`).setAuthor(Member.user.username, Member.user.avatarURL({ dynamic: true }), `https://discord.com/users/${Member.id}`));
                }
                if (react.emoji.name == '◀') {
                    await react.users.remove(message.author.id).catch(() => undefined)
                    if (liste.slice((page - 1) * 10 - 10, (page - 1) * 10).length <= 0) return;
                    page -= 1;
                    let newList = liste.slice(page == 1 ? 0 : page * 10 - 10, page * 10).join('\n');
                    msg.edit(new MessageEmbed().setTitle(`Davet Ettiği Üyeler (Toplam ${Members.length} davet)`).setDescription(`${newList}`).setAuthor(Member.user.username, Member.user.avatarURL({ dynamic: true }), `https://discord.com/users/${Member.id}`));
                }
            });
        }
    } else if (command === 'top10' || command === 'top' || command === 'topinv' || command === 'topdavet' || command === 'sıralama') {
        const InviteTop = await InviteModel.find({}).sort({ 'Total': -1 }).exec();
        if (!InviteTop || !InviteTop.length) return message.channel.send(embed.setDescription('Sunucunuzda davet yapan hiç üye yok.'));
        const liste = InviteTop.map((e, i) => {
            const eMember = message.guild.member(e.Id);
            if (eMember && e.Total !== 0) return `**${i + 1}.** ${eMember} • \`${e.Total}\` davet (\`${e.Unsuccessful}\` başarısız, \`${e.Successful}\` başarılı)`;
        });
        await message.channel.send(embed.setDescription(`${liste.slice(0, 10).join('\n')}`).setAuthor(message.guild.name, message.guild.iconURL({ dynamic: true })));
    }  else if (command === 'cihaz') {
        if (message.member.roles.highest.position < message.guild.roles.cache.get(Settings.MinStaffRole).position) return;
        const victim = message.mentions.users.first() || Invite.users.cache.get(args[0]) || message.author;
        const platform = Object.keys(victim.presence.clientStatus).join(', ').replace('mobile', 'Mobil Telefon').replace('desktop', 'Bilgisayar').replace('web','İnternet Tarayıcısı') || 'Bulunamadı';
        message.channel.send(`${victim.tag} üyesinin şu anda kullandığı cihaz: \`${platform}.\``);
    }
});


Invite.on('guildMemberRoleRemove', async (member, role) => {
    const Log = await member.guild.fetchAuditLogs({ limit: 1, type: 'MEMBER_ROLE_UPDATE' }).then(audit => audit.entries.first());
    if (!Log || !Log.executor || Log.executor.bot || Log.createdTimestamp < (Date.now() - 5000) || member.guild.roles.cache.get(role.id).position < member.guild.roles.cache.get(Settings.MinStaffRole).position) return;
    const Data = await RLModel.findOne({ Id: member.id }) || new RLModel({ Id: member.id });
    Data.Logs.push({
        Date: Date.now(),
        Type: 'KALDIRMA',
        Executor: Log.executor.id,
        Role: role.id
    });
    Data.save()
});

Invite.on('guildMemberRoleAdd', async (member, role) => {
    const Log = await member.guild.fetchAuditLogs({ limit: 1, type: 'MEMBER_ROLE_UPDATE' }).then(audit => audit.entries.first());
    if (!Log || !Log.executor || Log.executor.bot || Log.createdTimestamp < (Date.now() - 5000) || member.guild.roles.cache.get(role.id).position < member.guild.roles.cache.get(Settings.MinStaffRole).position) return;
    const Data = await RLModel.findOne({ Id: member.id }) || new RLModel({ Id: member.id });
    Data.Logs.push({
        Date: Date.now(),
        Type: 'EKLEME',
        Executor: Log.executor.id,
        Role: role.id
    });
    Data.save()
});

Invite.login(Settings.Token).then(() => console.log('[INVITE] Bot is connected!')).catch(() => console.error('[INVITE] Bot is not connect!'));