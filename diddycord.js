import { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection } from 'discord.js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import os from 'os';

// GitHub API configuration using secrets
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const PREFIX = ".";
const cooldowns = new Collection();

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    client.user.setActivity("use .help", { type: "PLAYING" });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return; // Ignore bots
    if (!message.content.startsWith(PREFIX)) return; // Check for prefix

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Cooldown system
    if (!cooldowns.has(command)) {
        cooldowns.set(command, new Collection());
    }

    const now = Date.now();
    const timestamps = cooldowns.get(command);
    const cooldownAmount = 3000; // 3 seconds default cooldown

    if (timestamps.has(message.author.id)) {
        const expirationTime = timestamps.get(message.author.id) + cooldownAmount;

        if (now < expirationTime) {
            const timeLeft = (expirationTime - now) / 1000;
            return message.reply(`Please wait ${timeLeft.toFixed(1)} more second(s) before using the \`${command}\` command.`);
        }
    }

    timestamps.set(message.author.id, now);
    setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

    // Original commands
    if (command === "loadstring") {
        message.channel.send('loadstring(game:HttpGet("hello"))()');
    }
    else if (command === "ping") {
        message.channel.send(`Pong! Latency is ${Math.round(client.ws.ping)}ms`);
    }
    else if (command === "autoloadstring") {
        if (!message.channel.isDMBased()) {
            return message.reply("This command only works in DMs for security reasons. Please DM me to use this command.");
        }

        const attachment = message.attachments.first();
        if (!attachment || !attachment.name.endsWith('.txt')) {
            return message.reply("Please attach a .txt file containing your script.");
        }

        try {
            await message.reply("Processing your script file...");

            const response = await fetch(attachment.url);
            const scriptContent = await response.text();

            if (!scriptContent || scriptContent.trim() === '') {
                return message.reply("The text file appears to be empty. Please provide a file with content.");
            }

            const tempFileName = `script_${message.author.id}_${Date.now()}.lua`;
            const repoName = `script_${Date.now()}`;
            const githubResponse = await createGitHubRepo(repoName, scriptContent, tempFileName);

            if (!githubResponse.success) {
                return message.reply(`Failed to create GitHub repository: ${githubResponse.error}`);
            }

            const loadstringCommand = `loadstring(game:HttpGet("${githubResponse.rawUrl}"))()`;
            message.reply(`Here's your loadstring command:\n\`\`\`lua\n${loadstringCommand}\n\`\`\``);

        } catch (error) {
            console.error("Error processing autoloadstring command:", error);
            message.reply("An error occurred while processing your script. Please try again later.");
        }
    }
    else if (command === "info") {
        message.channel.send(`Bot Name: ${client.user.tag}\nBot ID: ${client.user.id}\nTotal Servers: ${client.guilds.cache.size}`);
    }
    else if (command === "kick") {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
            return message.channel.send('You do not have permission to kick members.');
        }
        const user = message.mentions.members.first();
        if (!user) {
            return message.channel.send('Please mention a user to kick.');
        }
        user.kick()
            .then(() => message.channel.send(`${user.user.tag} has been kicked.`))
            .catch(err => message.channel.send('I was unable to kick the user.'));
    }
    else if (command === "ban") {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.channel.send('You do not have permission to ban members.');
        }
        const user = message.mentions.members.first();
        if (!user) {
            return message.channel.send('Please mention a user to ban.');
        }
        user.ban()
            .then(() => message.channel.send(`${user.user.tag} has been banned.`))
            .catch(err => message.channel.send('I was unable to ban the user.'));
    }
    else if (command === "purge") {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.channel.send('You do not have permission to purge messages.');
        }
        const deleteCount = parseInt(args[0], 10);
        if (!deleteCount || deleteCount < 1 || deleteCount > 100) {
            return message.channel.send('Please provide a number between 1 and 100 to delete.');
        }
        message.channel.bulkDelete(deleteCount + 1, true)
            .then(deleted => message.channel.send(`${deleted.size - 1} message(s) have been deleted.`))
            .catch(err => message.channel.send('There was an error trying to purge messages.'));
    }

    // MODERATION COMMANDS
    else if (command === "mute" || command === "timeout") {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.channel.send('You do not have permission to mute members.');
        }
        const user = message.mentions.members.first();
        if (!user) {
            return message.channel.send('Please mention a user to mute.');
        }
        const duration = args[1] ? parseInt(args[1]) : 5;
        user.timeout(duration * 60 * 1000, args.slice(2).join(' ') || 'No reason provided')
            .then(() => message.channel.send(`${user.user.tag} has been muted for ${duration} minutes.`))
            .catch(err => message.channel.send('I was unable to mute the user.'));
    }
    else if (command === "unmute") {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.channel.send('You do not have permission to unmute members.');
        }
        const user = message.mentions.members.first();
        if (!user) {
            return message.channel.send('Please mention a user to unmute.');
        }
        user.timeout(null)
            .then(() => message.channel.send(`${user.user.tag} has been unmuted.`))
            .catch(err => message.channel.send('I was unable to unmute the user.'));
    }
    else if (command === "warn") {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.channel.send('You do not have permission to warn members.');
        }
        const user = message.mentions.members.first();
        if (!user) {
            return message.channel.send('Please mention a user to warn.');
        }
        const reason = args.slice(1).join(' ') || 'No reason provided';
        message.channel.send(`${user.user.tag} has been warned for: ${reason}`);
        user.send(`You have been warned in ${message.guild.name} for: ${reason}`).catch(() => {
            message.channel.send("Couldn't DM the user about their warning.");
        });
    }
    else if (command === "slowmode") {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.channel.send('You do not have permission to change slowmode settings.');
        }
        const seconds = parseInt(args[0], 10);
        if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
            return message.channel.send('Please provide a valid number of seconds between 0 and 21600 (6 hours).');
        }
        message.channel.setRateLimitPerUser(seconds)
            .then(() => message.channel.send(`Slowmode set to ${seconds} seconds.`))
            .catch(err => message.channel.send('Failed to set slowmode.'));
    }
    else if (command === "lock") {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.channel.send('You do not have permission to lock channels.');
        }
        message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false })
            .then(() => message.channel.send('Channel locked.'))
            .catch(err => message.channel.send('Failed to lock the channel.'));
    }
    else if (command === "unlock") {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.channel.send('You do not have permission to unlock channels.');
        }
        message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null })
            .then(() => message.channel.send('Channel unlocked.'))
            .catch(err => message.channel.send('Failed to unlock the channel.'));
    }
    else if (command === "unban") {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.channel.send('You do not have permission to unban members.');
        }
        const userId = args[0];
        if (!userId) {
            return message.channel.send('Please provide a user ID to unban.');
        }
        message.guild.bans.remove(userId)
            .then(() => message.channel.send(`User with ID ${userId} has been unbanned.`))
            .catch(err => message.channel.send('I was unable to unban the user. Check if the ID is correct.'));
    }
    else if (command === "banlist") {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.channel.send('You do not have permission to view the ban list.');
        }
        message.guild.bans.fetch()
            .then(bans => {
                if (bans.size === 0) {
                    return message.channel.send('There are no banned users in this server.');
                }
                const banList = bans.map(ban => `${ban.user.tag} (${ban.user.id}): ${ban.reason || 'No reason provided'}`).join('\n');
                message.channel.send(`**Banned Users:**\n${banList.substring(0, 1900)}${banList.length > 1900 ? '...' : ''}`);
            })
            .catch(err => message.channel.send('Failed to fetch ban list.'));
    }

    // INFORMATION COMMANDS
    else if (command === "serverinfo") {
        const embed = new EmbedBuilder()
            .setTitle(message.guild.name)
            .setThumbnail(message.guild.iconURL())
            .setColor('#0099ff')
            .addFields(
                { name: 'Owner', value: `<@${message.guild.ownerId}>`, inline: true },
                { name: 'Members', value: message.guild.memberCount.toString(), inline: true },
                { name: 'Created On', value: new Date(message.guild.createdTimestamp).toLocaleDateString(), inline: true },
                { name: 'Channels', value: message.guild.channels.cache.size.toString(), inline: true },
                { name: 'Roles', value: message.guild.roles.cache.size.toString(), inline: true },
                { name: 'Boosts', value: message.guild.premiumSubscriptionCount.toString(), inline: true }
            )
            .setFooter({ text: `Server ID: ${message.guild.id}` });
        message.channel.send({ embeds: [embed] });
    }
    else if (command === "userinfo") {
        const user = message.mentions.users.first() || message.author;
        const member = message.guild.members.cache.get(user.id);
        const embed = new EmbedBuilder()
            .setTitle(user.tag)
            .setThumbnail(user.displayAvatarURL())
            .setColor('#0099ff')
            .addFields(
                { name: 'Joined Server', value: new Date(member.joinedTimestamp).toLocaleDateString(), inline: true },
                { name: 'Account Created', value: new Date(user.createdTimestamp).toLocaleDateString(), inline: true },
                { name: 'Roles', value: member.roles.cache.map(r => r.name).join(', ').substring(0, 1024) || 'None' }
            )
            .setFooter({ text: `User ID: ${user.id}` });
        message.channel.send({ embeds: [embed] });
    }
    else if (command === "avatar") {
        const user = message.mentions.users.first() || message.author;
        const embed = new EmbedBuilder()
            .setTitle(`${user.tag}'s Avatar`)
            .setImage(user.displayAvatarURL({ size: 1024 }))
            .setColor('#0099ff');
        message.channel.send({ embeds: [embed] });
    }
    else if (command === "roleinfo") {
        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
        if (!role) {
            return message.channel.send('Please mention a role or provide a valid role ID.');
        }
        const embed = new EmbedBuilder()
            .setTitle(role.name)
            .setColor(role.color)
            .addFields(
                { name: 'Members', value: role.members.size.toString(), inline: true },
                { name: 'Created On', value: new Date(role.createdTimestamp).toLocaleDateString(), inline: true },
                { name: 'Position', value: role.position.toString(), inline: true },
                { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true }
            )
            .setFooter({ text: `Role ID: ${role.id}` });
        message.channel.send({ embeds: [embed] });
    }
    else if (command === "channelinfo") {
        const channel = message.mentions.channels.first() || message.channel;
        const embed = new EmbedBuilder()
            .setTitle(`#${channel.name}`)
            .setColor('#0099ff')
            .addFields(
                { name: 'Type', value: channel.type, inline: true },
                { name: 'Created On', value: new Date(channel.createdTimestamp).toLocaleDateString(), inline: true },
                { name: 'NSFW', value: channel.nsfw ? 'Yes' : 'No', inline: true },
                { name: 'Topic', value: channel.topic || 'None', inline: false }
            )
            .setFooter({ text: `Channel ID: ${channel.id}` });
        message.channel.send({ embeds: [embed] });
    }

    // UTILITY COMMANDS
    else if (command === "poll") {
        if (args.length < 1) {
            return message.channel.send('Please provide a question for the poll.');
        }

        const question = args.join(' ');
        const embed = new EmbedBuilder()
            .setTitle('📊 Poll')
            .setDescription(question)
            .setColor('#0099ff')
            .setFooter({ text: `Poll created by ${message.author.tag}` });

        const pollMessage = await message.channel.send({ embeds: [embed] });
        await pollMessage.react('👍');
        await pollMessage.react('👎');
        await pollMessage.react('🤷');
    }
    // Server Management Commands
    else if (command === "createchannel") {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply("You don't have permission!");
        const channelName = args.join('-').toLowerCase();
        if (!channelName) return message.reply("Please specify a channel name!");
        message.guild.channels.create({ name: channelName })
            .then(channel => message.reply(`Created channel ${channel}`))
            .catch(err => message.reply("Failed to create channel"));
    }
    else if (command === "delchannel") {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply("You don't have permission!");
        const channel = message.mentions.channels.first() || message.channel;
        channel.delete().then(() => message.author.send(`Deleted channel ${channel.name}`))
            .catch(err => message.reply("Failed to delete channel"));
    }
    else if (command === "createrole") {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply("You don't have permission!");
        const roleName = args.join(' ');
        if (!roleName) return message.reply("Please specify a role name!");
        message.guild.roles.create({ name: roleName })
            .then(role => message.reply(`Created role ${role.name}`))
            .catch(err => message.reply("Failed to create role"));
    }
    else if (command === "delrole") {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply("You don't have permission!");
        const role = message.mentions.roles.first();
        if (!role) return message.reply("Please mention a role!");
        role.delete()
            .then(() => message.reply(`Deleted role ${role.name}`))
            .catch(err => message.reply("Failed to delete role"));
    }
    else if (command === "giverole") {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply("You don't have permission!");
        const member = message.mentions.members.first();
        const role = message.mentions.roles.first();
        if (!member || !role) return message.reply("Please mention both a user and a role!");
        member.roles.add(role)
            .then(() => message.reply(`Given ${role} to ${member}`))
            .catch(err => message.reply("Failed to give role"));
    }
    else if (command === "removerole") {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply("You don't have permission!");
        const member = message.mentions.members.first();
        const role = message.mentions.roles.first();
        if (!member || !role) return message.reply("Please mention both a user and a role!");
        member.roles.remove(role)
            .then(() => message.reply(`Removed ${role} from ${member}`))
            .catch(err => message.reply("Failed to remove role"));
    }

    // Utility Commands
    else if (command === "servericon") {
        const embed = new EmbedBuilder()
            .setTitle(message.guild.name)
            .setImage(message.guild.iconURL({ size: 4096 }))
            .setColor('#0099ff');
        message.reply({ embeds: [embed] });
    }
    else if (command === "nickname") {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames)) return message.reply("You don't have permission!");
        const member = message.mentions.members.first();
        const nickname = args.slice(1).join(' ');
        if (!member || !nickname) return message.reply("Please mention a user and provide a nickname!");
        member.setNickname(nickname)
            .then(() => message.reply(`Set ${member}'s nickname to ${nickname}`))
            .catch(err => message.reply("Failed to set nickname"));
    }
    else if (command === "members") {
        const online = message.guild.members.cache.filter(m => m.presence?.status === 'online').size;
        const total = message.guild.memberCount;
        message.reply(`Online: ${online}\nTotal: ${total}`);
    }
    else if (command === "roles") {
        const roles = message.guild.roles.cache.map(r => r.name).join(', ');
        message.reply(`Server roles: ${roles}`);
    }
    else if (command === "channels") {
        const channels = message.guild.channels.cache.map(c => c.name).join(', ');
        message.reply(`Server channels: ${channels}`);
    }
    else if (command === "emojis") {
        const emojis = message.guild.emojis.cache.map(e => e.toString()).join(' ');
        message.reply(`Server emojis: ${emojis || 'None'}`);
    }
    else if (command === "invites") {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return message.reply("You don't have permission!");
        message.guild.invites.fetch()
            .then(invites => message.reply(`Active invites: ${invites.size}`))
            .catch(err => message.reply("Failed to fetch invites"));
    }
    else if (command === "createinvite") {
        message.channel.createInvite()
            .then(invite => message.reply(`Created invite: ${invite.url}`))
            .catch(err => message.reply("Failed to create invite"));
    }

    // Fun Commands
    else if (command === "8ball") {
        const responses = ['Yes', 'No', 'Maybe', 'Definitely', 'Not sure', 'Ask again later', 'Better not tell you now'];
        message.reply(`🎱 ${responses[Math.floor(Math.random() * responses.length)]}`);
    }
    else if (command === "dice") {
        const num = args[0] || 6;
        message.reply(`🎲 You rolled a ${Math.floor(Math.random() * num) + 1}`);
    }
    else if (command === "coinflip") {
        message.reply(`🪙 ${Math.random() < 0.5 ? 'Heads' : 'Tails'}`);
    }
    else if (command === "rps") {
        const choices = ['rock', 'paper', 'scissors'];
        const choice = args[0]?.toLowerCase();
        if (!choices.includes(choice)) return message.reply("Please choose rock, paper, or scissors!");
        const botChoice = choices[Math.floor(Math.random() * choices.length)];
        message.reply(`You chose ${choice}, I chose ${botChoice}`);
    }

    // Information Commands
    else if (command === "uptime") {
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor(uptime / 3600) % 24;
        const minutes = Math.floor(uptime / 60) % 60;
        message.reply(`Uptime: ${days}d ${hours}h ${minutes}m`);
    }
    else if (command === "botinfo") {
        const embed = new EmbedBuilder()
            .setTitle('Bot Information')
            .addFields(
                { name: 'Servers', value: client.guilds.cache.size.toString(), inline: true },
                { name: 'Users', value: client.users.cache.size.toString(), inline: true },
                { name: 'Channels', value: client.channels.cache.size.toString(), inline: true },
                { name: 'Discord.js', value: '14.x', inline: true }
            )
            .setColor('#0099ff');
        message.reply({ embeds: [embed] });
    }

    // Moderation Commands
    else if (command === "voicekick") {
        if (!message.member.permissions.has(PermissionFlagsBits.MoveMembers)) return message.reply("You don't have permission!");
        const member = message.mentions.members.first();
        if (!member.voice.channel) return message.reply("User is not in a voice channel!");
        member.voice.disconnect()
            .then(() => message.reply(`Disconnected ${member} from voice`))
            .catch(err => message.reply("Failed to disconnect user"));
    }
    else if (command === "deafen") {
        if (!message.member.permissions.has(PermissionFlagsBits.DeafenMembers)) return message.reply("You don't have permission!");
        const member = message.mentions.members.first();
        if (!member.voice.channel) return message.reply("User is not in a voice channel!");
        member.voice.setDeaf(true)
            .then(() => message.reply(`Deafened ${member}`))
            .catch(err => message.reply("Failed to deafen user"));
    }
    else if (command === "undeafen") {
        if (!message.member.permissions.has(PermissionFlagsBits.DeafenMembers)) return message.reply("You don't have permission!");
        const member = message.mentions.members.first();
        if (!member.voice.channel) return message.reply("User is not in a voice channel!");
        member.voice.setDeaf(false)
            .then(() => message.reply(`Undeafened ${member}`))
            .catch(err => message.reply("Failed to undeafen user"));
    }

    // Help Command
    else if (command === "sniper") {
        const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
        const words = [];
        
        // Generate 100 4-letter combinations
        for(let i = 0; i < 100; i++) {
            let word = '';
            for(let j = 0; j < 4; j++) {
                word += characters[Math.floor(Math.random() * characters.length)];
            }
            words.push(word);
        }

        message.channel.send('Checking usernames... Please wait.');
        
        // Check availability
        const availableWords = [];
        for(const word of words) {
            try {
                const response = await fetch(`https://www.roblox.com/users/profile?username=${word}`);
                if(response.status === 404) {
                    availableWords.push(word);
                }
                // Add small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch(error) {
                console.error(`Error checking username ${word}:`, error);
            }
        }

        if(availableWords.length > 0) {
            const embed = new EmbedBuilder()
                .setTitle('Available Usernames')
                .setDescription(availableWords.join('\n'))
                .setColor('#00ff00')
                .setFooter({ text: `Found ${availableWords.length} available names` });
            message.channel.send({ embeds: [embed] });
        } else {
            message.channel.send('No available usernames found.');
        }
    }
    else if (command === "help") {
        const embed = new EmbedBuilder()
            .setTitle('Bot Commands')
            .setColor('#0099ff')
            .setDescription("Here are the available commands:")
            .addFields(
                // Original Commands
                { name: 'Original Commands', value: '.loadstring, .ping, .info, .kick, .ban, .purge, .mute, .unmute, .warn, .slowmode, .lock, .unlock, .unban, .banlist, .serverinfo, .userinfo, .avatar, .roleinfo, .channelinfo, .poll, .autoloadstring' },
                
                // Server Management
                { name: 'Server Management', value: '.createchannel, .delchannel, .createrole, .delrole, .giverole, .removerole' },
                
                // Utility
                { name: 'Utility', value: '.servericon, .nickname, .members, .roles, .channels, .emojis, .invites, .createinvite' },
                
                // Fun
                { name: 'Fun', value: '.8ball, .dice, .coinflip, .rps, .sniper' },
                
                // Information
                { name: 'Information', value: '.uptime, .botinfo' },
                
                // Voice Moderation
                { name: 'Voice Moderation', value: '.voicekick, .deafen, .undeafen' }
            )
            .setFooter({ text: 'Use . prefix before commands' });
        message.channel.send({ embeds: [embed] });
    }
});

async function createGitHubRepo(repoName, scriptContent, fileName) {
    try {
        const createRepoResponse = await fetch(`https://api.github.com/user/repos`, {
            method: 'POST',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: repoName,
                description: 'Script repository created by Discord bot',
                private: false,
                auto_init: true
            })
        });

        if (!createRepoResponse.ok) {
            const errorData = await createRepoResponse.json();
            return { success: false, error: `Failed to create repository: ${errorData.message}` };
        }

        const repoData = await createRepoResponse.json();
        await new Promise(resolve => setTimeout(resolve, 1000));

        const uploadFileResponse = await fetch(`https://api.github.com/repos/${GITHUB_USERNAME}/${repoName}/contents/${fileName}`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Upload script file',
                content: Buffer.from(scriptContent).toString('base64')
            })
        });

        if (!uploadFileResponse.ok) {
            const errorData = await uploadFileResponse.json();
            return { success: false, error: `Failed to upload file: ${errorData.message}` };
        }

        const fileData = await uploadFileResponse.json();

        return {
            success: true,
            rawUrl: `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${repoName}/main/${fileName}`
        };
    } catch (error) {
        console.error("GitHub API error:", error);
        return { success: false, error: "Failed to interact with GitHub API" };
    }
}

client.login(process.env.DISCORD_TOKEN);
